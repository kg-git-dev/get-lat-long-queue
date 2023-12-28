const geosearch = require("./Geo/geoSearch");
const { acquireLock, calculateAppointmentTime } = require("./Middleware/lock");
const { delay, addToQueue } = require("./Middleware/queue");

const getLatLong = async (
    redisClient,
    latLongQueueKey,
    latLongLockKey,
    latLongLocalLockKey,
    latLongProcessingKey,
    expirationTime,
    { id, locationToSearch },
    displayLogs
) => {

    // Retrieve and store timestamp to identify specific requests irrespective of the user.
    const requestTimestamp = Date.now();

    displayLogs ? console.log(`user id: ${id}. GetLatLong called at ${new Date(Date.now()).toLocaleString()}`) : '';

    // Add to queue with details and retrieve position, previous execution time, and process status. Check Middleware/queue.js.
    const queueDetails = await addToQueue(
        redisClient,
        latLongQueueKey,
        latLongProcessingKey,
        latLongLockKey,
        latLongLocalLockKey,
        { id, locationToSearch, requestTimestamp },
        displayLogs
    );

    //Destructure the object received to queueDetails
    const queuePosition = queueDetails.position;
    const lastExecutionTimeLock = queueDetails.tempLock;
    const lastExecutionTimeLocal = queueDetails.lastTimeKeyValue;
    let processStatus = queueDetails.processStatus;

    // In order to avoid race conditions, we need to consider four scenarios:
    // - no one is in the queue i.e. lock has expired and queuePosition is first.
    // - lock hasn't expired but first one in the queue. Wait for lock to expire and execute.
    // - not first in the queue but process hasn't started yet. Wait for object in front of the queue to start the process.
    // - process is already in order. Just calculate your appointment time.

    // Except when first, all users will wait for lock to expire before firing. This is to avoid unnecessary processes.
    // Time accurate to milliseconds of lock creation is saved in the lock on execution. See middleware/lock.js.
    // Calculate appointment time based on queue position and previous execution time and wait in the waiting room.

    let appointmentTime;
    let waitingRoom;

    if (isNaN(lastExecutionTimeLock) && queuePosition === 0) {
        waitingRoom = 0;
        displayLogs ? console.log(`user id: ${id}, no queue, lock expired, ${new Date(Date.now()).toLocaleString()}`) : '';
    }
    else if (queuePosition === 0) {
        appointmentTime = Math.max(Date.now(), lastExecutionTimeLocal + expirationTime)
        waitingRoom = appointmentTime - Date.now()
        displayLogs ? console.log(`user id: ${id}, no queue, lock active, delay by ${waitingRoom / 1000} seconds, ${new Date(Date.now()).toLocaleString()}`) : '';
    }
    else if (processStatus === false) {
        // To avoid race conditions, need to wait for first in the queue to start process. Details in lock.js.
        let processCounter = 0;
        while (processStatus === false) {
            let processStatusString = await redisClient.GET(latLongProcessingKey);
            processStatus = processStatusString === 'true' ? true : false
            processCounter++
            await delay(100); // Check every 100ms
        }
        appointmentTime = await calculateAppointmentTime(queuePosition, lastExecutionTimeLocal, id, expirationTime, displayLogs)
        waitingRoom = appointmentTime - Date.now()
        displayLogs ? console.log(`user id: ${id}, queue, process inactive, tried ${processCounter} times, delay by ${waitingRoom / 1000} seconds, ${new Date(Date.now()).toLocaleString()}`) : '';
    }
    else {
        appointmentTime = await calculateAppointmentTime(queuePosition, lastExecutionTimeLocal, id, expirationTime, displayLogs)
        waitingRoom = appointmentTime - Date.now()
        displayLogs ? console.log(`user id: ${id}, queue and process active, delay by ${waitingRoom / 1000} seconds, ${new Date(Date.now()).toLocaleString()}`) : '';
    }

    // Wait for appointment time
    await delay(waitingRoom)
    displayLogs ? console.log(`user id: ${id}, after delay, ${new Date(Date.now()).toLocaleString()}`) : '';

    // Try to acquire lock
    const lockStatus = await acquireLock(
        redisClient,
        latLongQueueKey,
        latLongLockKey,
        latLongLocalLockKey,
        latLongProcessingKey,
        expirationTime,
        id,
        displayLogs,
    )

    // Since the lock is active for a supplied expiration time, we can guarantee spacing between requests.

    try {
        if (lockStatus === true) {
            const result = await makeApiCall(id, locationToSearch)

            return result;
        } else {
            console.log(`user id: ${id}, failed to acquire lock`);
        }
    } catch (err) {
        console.log(`user id: ${id} error while making external api call`)
    }

};

const makeApiCall = async (id, locationToSearch) => {
    displayLogs ? console.log(`user id: ${id} made external api call at ${new Date(Date.now()).toLocaleString()}`) : '';
    const result = await geosearch(locationToSearch);
    const { lat, lon } = result[0];
    return { lat, lon };
}


module.exports = getLatLong;