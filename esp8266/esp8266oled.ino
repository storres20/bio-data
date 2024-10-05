#include <ESP8266WiFi.h>
#include <WiFiManager.h>  // WiFiManager library

#include <DHT.h>
#include <OneWire.h>
#include <DallasTemperature.h>

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

// OLED setup
Adafruit_SH1106G display = Adafruit_SH1106G(128, 64, &Wire); // Create an instance of the display

char username[16]; // To store the input username

WiFiManagerParameter custom_username("username", "Enter username", "", 16); // Custom parameter for username

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

  // Initialize I2C for OLED
  Wire.begin(D2, D1); // SDA = D2 (GPIO4), SCL = D1 (GPIO5)

  // Initialize OLED display
  display.begin(0x3C, true); // Address 0x3C (change if your OLED uses a different I2C address)
  display.clearDisplay();
  display.display();

  // Add custom parameter to WiFiManager
  wifiManager.addParameter(&custom_username);

  // Automatically connect to saved WiFi or start AP for configuration if no network is available
  wifiManager.autoConnect("ESP8266-Setup", "password123");

  // After connection, get the username from the custom field
  strcpy(username, custom_username.getValue());

  // Convert username to lowercase
  toLowerCase(username);

  // Check if a username was entered and store it in EEPROM
  if (strlen(username) > 0) {
    saveUsername(username); // Save username to EEPROM
  } else if (isUsernameStored()) {
    getUsername(); // Retrieve stored username from EEPROM
  } else {
    strcpy(username, "guest"); // Default username
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

  if (WiFi.status() == WL_CONNECTED) {
    digitalWrite(LED_PIN, HIGH); // Turn on LED while WiFi is connected

    WiFiClientSecure client;
    client.setInsecure(); // Disable certificate verification

    if (client.connect(host, 443)) {
      String jsonPayload = "{\"username\":\"" + String(username) + "\", \"temperature\":" + String(temperature) + ", \"humidity\":" + String(humidity) + ", \"dsTemperature\":" + String(dsTemperature) + "}";

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

  // Display greeting
  display.setCursor(0, 0);
  display.print("Welcome ");
  display.print(username);

  // Display DHT11 readings
  display.setCursor(0, 20);
  display.print("Temp: ");
  display.print(tempDHT);
  display.print(" C");

  display.setCursor(0, 30);
  display.print("Humidity: ");
  display.print(humDHT);
  display.print(" %");

  // Display DS18B20 reading
  display.setCursor(0, 40);
  display.print("DS18B20 Temp: ");
  display.print(tempDS);
  display.print(" C");

  display.display(); // Send buffer to display
}

// Convert username to lowercase
void toLowerCase(char* str) {
  for (int i = 0; str[i]; i++) {
    str[i] = tolower(str[i]);
  }
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
