// essentially creating a system to talk to two vibration sensors and collect their readings efficiently.

const ModbusRTU = require("modbus-serial");
const client = new ModbusRTU();

// === CONFIGURABLE PARAMETERS ===
const RS485_PORT = "/dev/ttyUSB0"; // RS485 serial port (Change if needed)
const BAUD_RATE = 9600; // Baud rate for communication (Adjust as needed)
const SENSORS = [
    { id: 1, register: 0x0001 }, // Sensor 1 with register address
    { id: 2, register: 0x0001 }  // Sensor 2 with register address
];
let pollingInterval = 500; // Initial polling interval in milliseconds

// Function to connect to the Modbus RTU device via RS485
// Opens the communication line to the sensors (like dialing into a conference call)
async function connectModbus() {
    try {
        // Tries to connect to RS485 port at "/dev/ttyUSB0" with 9600 baud rate, 9600, specifies the speed of data transmission over the serial interface.
        await client.connectRTUBuffered(RS485_PORT, { baudRate: BAUD_RATE });
        console.log("Connected to RS485");
        // Sets a 200ms timeout for responses from the Modbus device. If the device does not respond within 200ms, the connection will be terminated.
        client.setTimeout(200);
    } catch (err) {
        console.error("Connection error:", err); // Print error if connection fails
        process.exit(1); // Exit script if unable to connect
    }
}

// Function to read data from a specific sensor
// Asks each sensor "What's your current vibration reading?" and records the answer
async function readSensor(sensor) {
    try {
        client.setID(sensor.id); // Set the Modbus slave ID (device address)
        /* This is the actual “asking” part. It sends a request to the sensor using the modbus-serial library’s readHoldingRegisters function. 
            `sensor.register` (e.g., 0x0001) is like the “mailbox” inside the sensor where the vibration reading is stored. */
        const data = await client.readHoldingRegisters(sensor.register, 1); // Read data from the specified register, The 1 means “read one piece of data” from that mailbox.
        console.log(`Sensor ${sensor.id} Data:`, data.data[0]); // Log the received data
        return data.data[0]; // Return the sensor value
    } catch (err) {
        console.error(`Error reading Sensor ${sensor.id}:`, err.message); // Print error message
        return null; // Return null if there was an error
    }
}

// Main polling loop to continuously read from sensors
// This uses that pollingInterval to control how long it waits between asking the sensors for data, keeping the loop steady and reliable.
async function pollSensors() {
    while (true) {
        const start = Date.now(); // Track start time of polling cycle
        for (const sensor of SENSORS) {
            await readSensor(sensor); // Read data from each sensor sequentially
        }
        
        const elapsed = Date.now() - start; // Calculate time taken for polling cycle
        const delay = Math.max(pollingInterval - elapsed, 0); // Adjust delay to maintain polling interval. Math.max(..., 0) ensures we don’t get a negative delay
        await new Promise(res => setTimeout(res, delay)); // This makes the program pause for the calculated delay.
    }
}

/* The goal of the optimizePollingRate function is to automatically figure out the fastest reliable polling rate—how 
    quickly you can ask for data without running into problems. It does this by testing different polling speeds, 
    starting slow and speeding up until it finds the limit where errors start happening.  */
async function optimizePollingRate() {

    /* The optimizePollingRate function is like a trial-and-error experiment. 
    It tries to find the shortest time between polls (the polling interval) that still works perfectly for both sensors. */
    
    let lastSuccessfulRate = pollingInterval; // It begins with a safe polling interval (e.g., 500ms) and keeps track of the last interval that worked well (lastSuccessfulRate).
    
    let decreaseStep = 50; // It reduces the polling interval little by little (by 50ms each time) to see how fast it can go.
    
    while (pollingInterval > 50) { // As long as the polling interval is above a minimum limit (50ms), it keeps testing.
        console.log(`Testing polling interval: ${pollingInterval}ms`);
        let successful = true; // Flag to track if polling was successful. Assumes it’ll work until proven wrong.
        
        /* it tries to read data from each sensor 5 times in a row at the current polling speed (set by pollingInterval). 
        If every single read works perfectly, the speed is considered good. But if even one read fails, 
        it decides the speed is too fast and stops the test. */

        for (let i = 0; i < 5; i++) { 
            /* Testing 5 times isn’t random—it’s 
            a way to make sure the speed isn’t just working by luck. 
            If it works 5 times in a row for both sensors, it’s probably a solid speed. 
            If it fails even once, that’s a sign it’s too fast to trust. */
            
            // For each of the 5 rounds, it asks both sensors for data. So, it’s testing every sensor every time.
            for (const sensor of SENSORS) {
                const data = await readSensor(sensor);
                if (data === null) { // If it did fail, something’s wrong—maybe the polling speed was too fast, and the sensor couldn’t keep up.
                    successful = false; 
                    break; /* If there’s a failure, this stops the inner loop immediately. No need to keep asking the other sensor in this round—something’s already gone wrong. */
                }
            }
            if (!successful) break; // if a failure happened, it stops the outer loop too. No point in doing the other 4 rounds if the speed already failed once.
        }
        
        if (successful) {
            lastSuccessfulRate = pollingInterval; // Store the last successful rate
            pollingInterval -= decreaseStep; // Try reducing polling interval further
        } else {
            pollingInterval = lastSuccessfulRate; // Revert to last stable polling rate
            console.log(`Optimal polling interval found: ${pollingInterval}ms`);
            break; // Exit optimization loop
        }
    }
}

// Start process
(async () => {
    await connectModbus(); // Establish connection to Modbus
    await optimizePollingRate(); // Optimize the polling interval
    pollSensors(); // Start polling sensors continuously
})();


/* The entire codebase is designed to connect to two vibration sensors via an RS485 port 
using the Modbus protocol in Node.js, find the fastest reliable polling rate to request data from them without errors, 
and then continuously collect and log their vibration readings at that optimized rate in a steady, error-free loop. */