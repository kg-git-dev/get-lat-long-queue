# get-lat-long

A node js redis package that creates a queue of requests and processes with FIFO principles, spacing requests, and retrieving lattitude and longitude data for a specified address from Nominatim API.

## Description

The application works as follows:
* Request is added to redis queue.
* Request position and previous request details are retrieved through redis transactions.
* Race conditions are checked.
* An appointment slot is given to the request.
* A distributed lock is acquired at appointment slot and set to time out at specific interval.
* Request is removed from the queue in the same transaction as new details are set.
* API call is made

Use of appointment slots improve performance since requests are activated only after the lock expires. However, in case of network latency, if a request is early in it's appointment slot, it will have to wait for the lock to expire. Does ensuring consistent spacing equal to the lock expiry interval.

## Getting Started

### Dependencies

* redis

### Installing

* Install with `npm i get-lat-long-queue`

### Executing program

* Accepts parameters : 
`latLangRedisClient`, 
`latLongQueueKey`, 
`latLongLockKey`, 
`latLongLocalLockKey`, 
`latLongProcessingKey`,
`expirationTime   // In milliseconds`, 
`{ id, locationToSearch }   // id to identify requests, full address as locationToSearch`,
`displayLogs`

* Example usage in node js redis express application


```
const express = require('express');
const redis = require('redis');
const getLatLong = require('get-lat-long-queue');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

const redisClient = redis.createClient();
redisClient.on('error', (error) => console.error(`Redis Error: ${error}`));
redisClient.connect();


app.use((req, res, next) => {
    req.redisClient = redisClient;
    next();
});

app.post("/getLatLong", async (req, res) => {
    try {
        const { id, locationToSearch } = req.body;

        const result = await getLatLong(
            latLangRedisClient = req.redisClient,
            latLongQueueKey = 'latLongQueueKey',
            latLongLockKey = 'latLongLockKey',
            latLongLocalLockKey = 'latLongLocalLockKey',
            latLongProcessingKey = 'latLongProcessingKey',
            expirationTime = 5000,
            { id, locationToSearch },
            displayLogs = true,
        );
        res.status(200).send({ result });

    } catch (e) {
        console.error(e);
        res.status(500).send('error at main route');
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port: ${PORT}`);
});
```

## Help

Pass displayLogs as true to log the execution flow with times.
```
displayLogs = true
```

## Author

Kushal Ghimire 
[@KG](https://www.kushalghimire.com)
ghimire.kushal@ymail.com


## Version History

* 0.1
    * Initial Release

