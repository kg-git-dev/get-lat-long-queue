const { delay } = require("./queue");

// acquireLock has a Lua script evaluated by redis.
// It tries to acquire a distributed redis lock and sets it expiration time equal to the value supplied.
// We are tagging the lock creation time accurate to microseconds while execution. 
// It had to be written in Lua since the script needs to conduct conditional checks before execution. 
// The script also saves the execution time stamp to another key.
// If there are other objects in the queue, it sets "latLongProcessingKey" to true. If the queue is empty it turns off the process.

const acquireLock = async (
  redisClient,
  latLongQueueKey,
  latLongLockKey,
  latLongLocalLockKey,
  latLongProcessingKey,
  expirationTime,
  id,
  displayLogs
) => {
  const luaScript = `
      local key = "${latLongLockKey}"
      local localKey = "${latLongLocalLockKey}"
      local processStatusKey = "${latLongProcessingKey}"
      local queueKey = "${latLongQueueKey}"
      local ttl = "${expirationTime}"

      local content = redis.call('time')
      local unixTimestampMillis = content[1] * 1000 + content[2] / 1000 -- Combine seconds and microseconds

      local lockSet = redis.call('setnx', key, unixTimestampMillis)

      if lockSet == 1 then
          redis.call('pexpire', key, ttl)
          local redisExecutionTime = redis.call('GET', key)
          
          -- Set latLongLocalLockKey to the value of latLongLockKey
          redis.call('SET', localKey, redisExecutionTime)
          
          -- Check the length of the queue and set latLongProcessingKey accordingly
          local queueLength = redis.call('LLEN', queueKey)
          if queueLength == 1 then
              redis.call('SET', processStatusKey, 'false')
          else
              redis.call('SET', processStatusKey, 'true')
          end

          -- LPOP queueKey
          redis.call('LPOP', queueKey)
      end

      return lockSet
  `;

  let result = await redisClient.eval(luaScript);
  let loopCounter = 0;

  // Lock creation requests are timed as appointments. However, there might be a few milliseconds latency.

  while (result !== 1) {
    await delay(100);
    result = await redisClient.eval(luaScript);
    loopCounter++;
  }

  displayLogs ? console.log(`user id: ${id}, Lock acquired after ${loopCounter} tries at ${new Date(Date.now()).toLocaleString()}`) : '';
  return result === 1;
};

// Helper function to calculate appointment time.
// Atomic redis execution means we can accurately determine appointment time based on the length of the array.

const calculateAppointmentTime = async (queuePosition, lastExecutionTime, id, expirationTime, displayLogs) => {
  const newAppointmentTime = lastExecutionTime + expirationTime * (queuePosition + 1);
  
  displayLogs ? console.log(`user id: ${id}, Appointment time: ${new Date(newAppointmentTime).toLocaleString()}, current time: ${new Date(Date.now()).toLocaleString()}`) : '';
  
  return newAppointmentTime;
}

module.exports = { acquireLock, calculateAppointmentTime };


