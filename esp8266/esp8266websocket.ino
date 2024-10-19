/* 19/10/2024 14:18 hours - This code finally works with websockets and SSL */

#include <ESP8266WiFi.h>
#include <ArduinoWebsockets.h>  // Include ArduinoWebsockets library
using namespace websockets;
#include <WiFiManager.h>       // WiFiManager library
#include <DHT.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <EEPROM.h>            // EEPROM library for storing username
#include <Adafruit_GFX.h>
#include <Adafruit_SH110X.h>
#include <time.h>              // Time library for NTP

// Pin definitions
#define DHTPIN D4        // Pin where the DHT11 is connected
#define DHTTYPE DHT11    // DHT 11
#define ONE_WIRE_BUS D3  // DS18B20 sensor
#define LED_PIN D5       // LED pin
#define RESET_PIN D6     // Reset button pin

// EEPROM settings
#define EEPROM_SIZE 32   // Size to store the username
#define USERNAME_ADDR 0  // Starting address for the username

// Replace with your server IP and port
const char* serverIP = "temphu.lonkansoft.pro";  // Backend server domain
const uint16_t serverPort = 3002;                // Backend server port

DHT dht(DHTPIN, DHTTYPE);
OneWire oneWire(ONE_WIRE_BUS);
DallasTemperature sensors(&oneWire);

WiFiManager wifiManager; // For Wi-Fi management

// OLED setup
Adafruit_SH1106G display = Adafruit_SH1106G(128, 64, &Wire);

char username[16]; // To store the input username

WiFiManagerParameter custom_username("username", "Enter username", "", 16);

WebsocketsClient webSocket; // WebSocket client

volatile bool resetTriggered = false;  // Flag to indicate button press

unsigned long previousMillis = 0;
const long interval = 2000;  // Interval at which to send data

// Function to handle WebSocket messages
void webSocketMessage(WebsocketsMessage message) {
  Serial.printf("WebSocket Message Received: %s\n", message.data().c_str());
}

// Function to handle WebSocket events
void webSocketEvent(WebsocketsEvent event, String data) {
  if (event == WebsocketsEvent::ConnectionOpened) {
    Serial.println("WebSocket Connected");
  } else if (event == WebsocketsEvent::ConnectionClosed) {
    Serial.println("WebSocket Disconnected");
  } else if (event == WebsocketsEvent::GotPing) {
    Serial.println("Received Ping");
  } else if (event == WebsocketsEvent::GotPong) {
    Serial.println("Received Pong");
  }
}

void ICACHE_RAM_ATTR resetWiFiSettings() {
  resetTriggered = true;  // Set the flag when the button is pressed
}

void setup() {
  Serial.begin(115200);

  // Initialize EEPROM
  EEPROM.begin(EEPROM_SIZE);

  // Initialize sensors
  dht.begin();
  sensors.begin();

  // Initialize the LED pin
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);  // Turn off LED initially

  // Initialize the reset button pin
  pinMode(RESET_PIN, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(RESET_PIN), resetWiFiSettings, FALLING);

  // Initialize I2C for OLED
  Wire.begin(D2, D1);

  // Initialize OLED display
  display.begin(0x3C, true);
  display.clearDisplay();
  display.display();

  // Add custom parameter to WiFiManager
  wifiManager.addParameter(&custom_username);

  // Auto-connect to Wi-Fi
  wifiManager.autoConnect("ESP8266-Setup", "password123");

  // After connection, get the username
  strcpy(username, custom_username.getValue());
  toLowerCase(username);

  if (strlen(username) > 0) {
    saveUsername(username);
  } else if (isUsernameStored()) {
    getUsername();
  } else {
    strcpy(username, "guest");
  }

  // Turn on the LED to indicate successful WiFi connection
  digitalWrite(LED_PIN, HIGH);

  // Initialize NTP for time syncing
  configTime(0, 0, "pool.ntp.org", "time.nist.gov");
  waitForNTPTime();

  // Initialize WebSocket
  webSocket.onMessage(webSocketMessage);
  webSocket.onEvent(webSocketEvent);
  webSocket.setInsecure(); // Disable SSL certificate verification
  String wsUrl = "wss://" + String(serverIP) + ":" + String(serverPort) + "/";
  webSocket.connect(wsUrl);
}

void loop() {
  // Check if the reset flag is set
  if (resetTriggered) {
    Serial.println("Reset button pressed! Clearing WiFi settings...");
    wifiManager.resetSettings();
    delay(1000);
    ESP.restart();
  }

  // Handle WebSocket events
  webSocket.poll();

  unsigned long currentMillis = millis();
  if (currentMillis - previousMillis >= interval) {
    previousMillis = currentMillis;

    // Read sensor data
    sensors.requestTemperatures();
    float dsTemperature = sensors.getTempCByIndex(0);

    float temperature = dht.readTemperature();
    float humidity = dht.readHumidity();

    // Update OLED display
    displayDataOnOLED(temperature, humidity, dsTemperature);

    // Create JSON payload
    String datetime = getDateTimeString();
    String jsonPayload = "{\"username\":\"" + String(username) + "\", \"temperature\":" + String(temperature) + ", \"humidity\":" + String(humidity) + ", \"dsTemperature\":" + String(dsTemperature) + ", \"datetime\":\"" + datetime + "\"}";

    // Send data over WebSocket
    webSocket.send(jsonPayload);

    // Display data on Serial Monitor
    Serial.print("DHT Temperature: ");
    Serial.print(temperature);
    Serial.print("°C, Humidity: ");
    Serial.print(humidity);
    Serial.println("%");

    Serial.print("DS18B20 Temperature: ");
    Serial.print(dsTemperature);
    Serial.println("°C");
  }
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
  for (int i = 0; i < 15; i++) {
    username[i] = EEPROM.read(USERNAME_ADDR + i);
  }
  username[15] = '\0';  // Null-terminate
}

// Save the username to EEPROM
void saveUsername(char* input) {
  for (int i = 0; i < 15; i++) {
    EEPROM.write(USERNAME_ADDR + i, input[i]);
  }
  EEPROM.write(USERNAME_ADDR + 15, '\0');  // Save null terminator
  EEPROM.commit(); // Commit the write to EEPROM
}

// Function to wait for NTP time synchronization and blink the LED
void waitForNTPTime() {
  bool ledState = LOW;
  while (time(nullptr) <= 100000) {
    Serial.println("Waiting for NTP time sync...");
    ledState = !ledState;
    digitalWrite(LED_PIN, ledState);
    delay(500);
  }
  digitalWrite(LED_PIN, HIGH);
  Serial.println("NTP time synchronized.");
}

// Function to get the current datetime as a string
String getDateTimeString() {
  time_t now = time(nullptr);
  struct tm* timeinfo = localtime(&now);
  char buffer[25];
  strftime(buffer, sizeof(buffer), "%Y/%m/%d %H:%M:%S", timeinfo);
  return String(buffer);
}

// Function to display data on OLED
void displayDataOnOLED(float tempDHT, float humDHT, float tempDS) {
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SH110X_WHITE);
  display.setCursor(0, 0);
  display.print("Welcome ");
  display.print(username);
  display.setCursor(0, 20);
  display.print("Temp: ");
  display.print(tempDHT);
  display.print(" C");
  display.setCursor(0, 30);
  display.print("Humidity: ");
  display.print(humDHT);
  display.print(" %");
  display.setCursor(0, 40);
  display.print("DS18B20 Temp: ");
  display.print(tempDS);
  display.print(" C");
  display.display();
}
