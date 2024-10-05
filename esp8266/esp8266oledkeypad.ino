#include <ESP8266WiFi.h>
#include <WiFiManager.h>  // WiFiManager library

#include <DHT.h>
#include <OneWire.h>
#include <DallasTemperature.h>

#include <Wire.h>
#include <Keypad.h>
#include <Keypad_I2C.h>
#include <EEPROM.h>  // EEPROM library for storing username

// Include OLED libraries
#include <Adafruit_GFX.h>
#include <Adafruit_SH110X.h>

// Pin definitions
#define DHTPIN D4     // Pin where the DHT11 is connected
#define DHTTYPE DHT11 // DHT 11
#define ONE_WIRE_BUS D3 // DS18B20 sensor
#define LED_PIN D5    // Reassigned LED pin to D5 (GPIO14)
#define RESET_PIN D6  // Reassigned reset button pin to D6 (GPIO12)

// EEPROM settings
#define EEPROM_SIZE 32 // Define the size to store the username
#define USERNAME_ADDR 0 // Starting address for the username

const char* postServerUrl = "/api/v1/datas/data"; // Your POST URL path
const char* host = "bio-data-peach-kappa.vercel.app"; // Hostname

DHT dht(DHTPIN, DHTTYPE);
OneWire oneWire(ONE_WIRE_BUS);
DallasTemperature sensors(&oneWire);

WiFiManager wifiManager; // Declare globally for access in loop()

volatile bool resetTriggered = false;  // Flag to indicate button press

// Keypad setup
const byte ROWS = 4; // Four rows
const byte COLS = 4; // Four columns
char keys[ROWS][COLS] = {
  {'1','2','3','A'},
  {'4','5','6','B'},
  {'7','8','9','C'},
  {'*','0','#','D'}
};

// Virtual row and column pin numbers
byte rowPins[ROWS] = {0, 1, 2, 3}; // Virtual row pins for I2C
byte colPins[COLS] = {4, 5, 6, 7}; // Virtual column pins for I2C

// I2C address of the PCF8574 connected to the keypad
const byte KEYPAD_I2C_ADDRESS = 0x20; // Adjust based on your wiring

byte numPins = ROWS + COLS; // Total number of pins

Keypad_I2C keypad = Keypad_I2C(makeKeymap(keys), rowPins, colPins, ROWS, COLS, KEYPAD_I2C_ADDRESS, numPins, &Wire);

// OLED setup
Adafruit_SH1106G display = Adafruit_SH1106G(128, 64, &Wire); // Create an instance of the display

char username[16]; // To store the input username

void ICACHE_RAM_ATTR resetWiFiSettings() {
  resetTriggered = true;  // Set the flag when the button is pressed
}

void setup() {
  Serial.begin(115200);

  // Initialize EEPROM
  EEPROM.begin(EEPROM_SIZE);

  // Initialize DHT and DS18B20 sensors
  dht.begin();
  sensors.begin();

  // Initialize the LED pin
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);  // Turn off LED initially

  // Initialize the reset button pin
  pinMode(RESET_PIN, INPUT_PULLUP);  // Use INPUT_PULLUP to prevent the need for an external resistor

  // Attach an interrupt to the reset button pin
  attachInterrupt(digitalPinToInterrupt(RESET_PIN), resetWiFiSettings, FALLING);

  // Initialize I2C for Keypad and OLED
  Wire.begin(D2, D1); // SDA = D2 (GPIO4), SCL = D1 (GPIO5)

  // Initialize Keypad
  keypad.begin(); // Initialize the keypad

  // Initialize OLED display
  display.begin(0x3C, true); // Address 0x3C (change if your OLED uses a different I2C address)
  display.clearDisplay();
  display.display();

  // Automatically connect to saved WiFi or start AP for configuration if no network is available
  wifiManager.autoConnect("ESP8266-Setup", "password123");

  // Check if a username is already stored in EEPROM
  if (isUsernameStored()) {
    // Greet the saved username
    getUsername();
    Serial.print("Hello, ");
    Serial.println(username);
    displayGreetingOnOLED(username);  // Correct function call here
  } else {
    // Ask for the username if not stored
    askForUsername();
  }

  // Turn on the LED to indicate successful WiFi connection
  digitalWrite(LED_PIN, HIGH);
}

void loop() {
  // Check if the reset flag is set by the interrupt
  if (resetTriggered) {
    Serial.println("Reset button pressed! Clearing WiFi settings...");
    wifiManager.resetSettings(); // Clear WiFi settings
    delay(1000); // Delay to allow time for message to be seen on Serial Monitor
    ESP.restart(); // Restart the ESP8266 to apply changes
  }

  // Read temperatures
  sensors.requestTemperatures(); // Send the command to get temperatures
  float dsTemperature = sensors.getTempCByIndex(0); // Read temperature from DS18B20

  float temperature = dht.readTemperature();
  float humidity = dht.readHumidity();

  // Update OLED display
  displayDataOnOLED(temperature, humidity, dsTemperature);

  // Handle keypad input
  char key = keypad.getKey();
  if (key) {
    Serial.print("Key pressed: ");
    Serial.println(key);
    // Implement any functionality you need with the keypad here
  }

  if (WiFi.status() == WL_CONNECTED) {
    digitalWrite(LED_PIN, HIGH); // Turn on LED while WiFi is connected

    WiFiClientSecure client;
    client.setInsecure(); // Disable certificate verification

    if (client.connect(host, 443)) {
      String jsonPayload = "{\"temperature\":" + String(temperature) + ", \"humidity\":" + String(humidity) + ", \"dsTemperature\":" + String(dsTemperature) + "}";

      client.println("POST " + String(postServerUrl) + " HTTP/1.1");
      client.println("Host: " + String(host));
      client.println("Content-Type: application/json");
      client.println("Content-Length: " + String(jsonPayload.length()));
      client.println("Connection: close");
      client.println(); // End of headers
      client.println(jsonPayload); // POST message body

      while (client.connected()) {
        String line = client.readStringUntil('\n');
        if (line == "\r") {
          break; // Headers received
        }
      }

      String postResponse = client.readString(); // Get the response payload
      Serial.println("POST Response:");
      Serial.println(postResponse); // Print the response
    } else {
      Serial.println("POST Connection failed");
    }

    client.stop(); // Close the connection
  } else {
    Serial.println("Error in WiFi connection");
    digitalWrite(LED_PIN, LOW); // Turn off LED if not connected
  }

  // Displaying both temperatures on the Serial Monitor
  Serial.print("DHT Temperature: ");
  Serial.print(temperature);
  Serial.print("°C, Humidity: ");
  Serial.print(humidity);
  Serial.println("%");

  Serial.print("DS18B20 Temperature: ");
  Serial.print(dsTemperature);
  Serial.println("°C");

  delay(500); // Repeat every 0.5 seconds
}

// Function to display data on OLED
void displayDataOnOLED(float tempDHT, float humDHT, float tempDS) {
  display.clearDisplay(); // Clear the buffer

  display.setTextSize(1);      // Normal 1:1 pixel scale
  display.setTextColor(SH110X_WHITE); // Draw white text

  // Display DHT11 readings
  display.setCursor(0, 10);
  display.print("DHT11 Temp: ");
  display.print(tempDHT);
  display.print(" C");

  display.setCursor(0, 20);
  display.print("Humidity: ");
  display.print(humDHT);
  display.print(" %");

  // Display DS18B20 reading
  display.setCursor(0, 30);
  display.print("DS18B20 Temp: ");
  display.print(tempDS);
  display.print(" C");

  display.display(); // Send buffer to display
}

// New function to display greeting on OLED
void displayGreetingOnOLED(char* user) {
  display.clearDisplay(); // Clear the buffer
  display.setTextSize(1); // Normal 1:1 pixel scale
  display.setTextColor(SH110X_WHITE); // Draw white text
  display.setCursor(0, 10);
  display.print("Hello, ");
  display.print(user);
  display.display(); // Send buffer to display
}

// Check if username is stored in EEPROM
bool isUsernameStored() {
  return EEPROM.read(USERNAME_ADDR) != 0xFF; // 0xFF is default erased value
}

// Retrieve the stored username from EEPROM
void getUsername() {
  for (int i = 0; i < 16; i++) {
    username[i] = EEPROM.read(USERNAME_ADDR + i);
  }
}

// Save the username to EEPROM
void saveUsername(char* input) {
  for (int i = 0; i < 16; i++) {
    EEPROM.write(USERNAME_ADDR + i, input[i]);
  }
  EEPROM.commit(); // Commit the write to EEPROM
}

// Ask for a username using the keypad and save it
void askForUsername() {
  char key;
  int index = 0;

  display.clearDisplay();
  display.setCursor(0, 0);
  display.print("Enter Username: ");
  display.display();

  while (index < 16) {
    key = keypad.getKey();
    if (key) {
      if (key == '#') { // Finish input when '#' is pressed
        username[index] = '\0'; // Null-terminate the string
        break;
      }
      username[index] = key; // Store the key press
      index++;
    }
  }

  saveUsername(username); // Save the input username to EEPROM
  displayGreetingOnOLED(username); // Greet the user on OLED after saving
}
