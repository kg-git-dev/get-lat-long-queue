const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// addToQueue adds request object to queue. This ensures we are able to track requests in order.
const addToQueue = async (
    redisClient,
    latLongQueueKey,
    latLongProcessingKey,
    latLongLockKey,
    latLongLocalLockKey,
    data,
    displayLogs
) => {
    try {
        await redisClient.RPUSH(latLongQueueKey, JSON.stringify(data));
    } catch (err) {
        console.log(`Error adding ${data.id} to queue, ${err}`);
        throw err;
    }

    // getQueuePositionAndDetails is fired as a separate transaction since we are no longer concerned with any new additions to the array
    const queueDetails = await getQueuePositionAndDetails(
        redisClient,
        latLongQueueKey,
        latLongLockKey,
        latLongProcessingKey,
        latLongLocalLockKey,
        data.id,
        data.timestamp,
        displayLogs
    )
    return queueDetails;
};

// getQueuePositionAndDetails and conducts a redis transaction execution ensuring data synchronization
const getQueuePositionAndDetails = async (
    redisClient,
    latLongQueueKey,
    latLongLockKey,
    latLongProcessingKey,
    latLongLocalLockKey,
    id,
    timestamp,
    displayLogs
) => {
    try {
        const multi = redisClient.multi();

        multi.LRANGE(latLongQueueKey, 0, -1);
        multi.GET(latLongLocalLockKey);
        multi.GET(latLongProcessingKey);
        multi.GET(latLongLockKey);

        const results = await multi.exec();

        const queueValues = results[0];
        const lastTimeKeyValue = results[1];
        const processStatusKeyValue = results[2];
        const latLongLockValue = results[3];


        // Match position of the object in the queue with id and timestamp and pass all relevant values as object.
        for (let i = 0; i < queueValues.length; i++) {
            const parsedData = JSON.parse(queueValues[i]);
            if (parsedData.id === id && parsedData.timestamp === timestamp) {
                displayLogs ? console.log(`user id: ${id} Added to queue at position: ${i} at ${new Date(Date.now()).toLocaleString()}`) : '';
                return { position: i, lastTimeKeyValue: parseInt(lastTimeKeyValue), processStatus: processStatusKeyValue === 'true' ? true : false, tempLock: parseInt(latLongLockValue) };
            }
        }
    } catch (err) {
        console.log(`user id: ${id} Error retrieving queue position: ${err}`);
        throw err;
    }
};


module.exports = { delay, addToQueue };