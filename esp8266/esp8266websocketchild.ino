#include <ESP8266WiFi.h>
#include <ArduinoWebsockets.h>
using namespace websockets;
#include <WiFiManager.h>
#include <DHT.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <EEPROM.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <time.h>

// Pin definitions
#define DHTPIN D4
#define DHTTYPE DHT11
#define ONE_WIRE_BUS D3
#define LED_PIN D5
#define RESET_PIN D6
#define BUTTON_PIN D7       // Define a new pin for the button

// EEPROM settings
#define EEPROM_SIZE 32
#define USERNAME_ADDR 0

const char* serverIP = "temphu.website101.xyz";
const uint16_t serverPort = 3002;

DHT dht(DHTPIN, DHTTYPE);
OneWire oneWire(ONE_WIRE_BUS);
DallasTemperature sensors(&oneWire);

WiFiManager wifiManager;
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, -1);

char username[16];
WiFiManagerParameter custom_username("username", "Enter username", "", 16);
WebsocketsClient webSocket;

volatile bool resetTriggered = false;
unsigned long previousMillis = 0;
const long interval = 2000;

// Variables for button handling and display mode
bool displayDT2 = false;       // Display mode flag
bool lastButtonState = HIGH;   // Last button state (not pressed)

void webSocketMessage(WebsocketsMessage message) {
  Serial.printf("WebSocket Message Received: %s\n", message.data().c_str());
}

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
  resetTriggered = true;
}

void setup() {
  Serial.begin(115200);
  EEPROM.begin(EEPROM_SIZE);
  dht.begin();
  sensors.begin();

  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);

  pinMode(RESET_PIN, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(RESET_PIN), resetWiFiSettings, FALLING);

  pinMode(BUTTON_PIN, INPUT_PULLUP);  // Set button pin as input with pull-up resistor

  Wire.begin(D2, D1);
  if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    Serial.println(F("SSD1306 allocation failed"));
    for (;;);
  }
  display.clearDisplay();
  display.display();

  wifiManager.addParameter(&custom_username);
  wifiManager.autoConnect("ESP8266-Setup-01", "password123");

  Serial.println("Connected to Wi-Fi.");
  Serial.print("IP Address: ");
  Serial.println(WiFi.localIP());

  strcpy(username, custom_username.getValue());
  toLowerCase(username);

  if (strlen(username) > 0) {
    saveUsername(username);
  } else if (isUsernameStored()) {
    getUsername();
  } else {
    strcpy(username, "guest");
  }

  digitalWrite(LED_PIN, HIGH);

  //configTime(0, 0, "pool.ntp.org", "time.nist.gov");
  configTime(-5 * 3600, 0, "pool.ntp.org", "time.nist.gov");
  waitForNTPTime();

  webSocket.onMessage(webSocketMessage);
  webSocket.onEvent(webSocketEvent);
  webSocket.setInsecure();
  String wsUrl = "wss://" + String(serverIP) + ":" + String(serverPort) + "/";
  webSocket.connect(wsUrl);
}

void loop() {
  if (resetTriggered) {
    Serial.println("Reset button pressed! Clearing WiFi settings...");
    wifiManager.resetSettings();
    delay(1000);
    ESP.restart();
  }

  webSocket.poll();

  unsigned long currentMillis = millis();
  if (currentMillis - previousMillis >= interval) {
    previousMillis = currentMillis;

    sensors.requestTemperatures();
    float dsTemperature = sensors.getTempCByIndex(0);
    float temperature = dht.readTemperature();
    float humidity = dht.readHumidity();

    // Read button state to toggle display mode
    bool buttonState = digitalRead(BUTTON_PIN);
    if (buttonState == LOW && lastButtonState == HIGH) {
      displayDT2 = !displayDT2;  // Toggle the display mode
    }
    lastButtonState = buttonState;

    // Update OLED display based on display mode
    if (displayDT2) {
      displayDT2Value(dsTemperature);
    } else {
      displayGreetingAndValues(temperature, humidity);
    }

    String datetime = getDateTimeString();
    String jsonPayload = "{\"username\":\"" + String(username) + "\", \"temperature\":" + String(temperature) + ", \"humidity\":" + String(humidity) + ", \"dsTemperature\":" + String(dsTemperature) + ", \"datetime\":\"" + datetime + "\"}";

    webSocket.send(jsonPayload);

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

// Display greeting and T1/H1 values on OLED
void displayGreetingAndValues(float tempDHT, float humDHT) {
  display.clearDisplay();
  display.setTextSize(2);
  display.setTextColor(SSD1306_WHITE);
  
  display.setCursor(0, 0);
  //display.print("Hi ");
  display.print(username);

  display.setCursor(0, 20);
  display.print("T1:");
  display.print(tempDHT);
  display.print("C");

  display.setCursor(0, 40);
  display.print("H1:");
  display.print(humDHT);
  display.print("%");

  display.display();
}

// Display only DT2 value on OLED
void displayDT2Value(float tempDS) {
  display.clearDisplay();
  display.setTextSize(2);
  display.setTextColor(SSD1306_WHITE);

  display.setCursor(0, 0);
  //display.print("Hi ");
  display.print(username);

  display.setCursor(0, 20);
  display.print("DT2:");
  display.print(tempDS);
  display.print("C");

  display.display();
}

// Convert username to lowercase
void toLowerCase(char* str) {
  for (int i = 0; str[i]; i++) {
    str[i] = tolower(str[i]);
  }
}

bool isUsernameStored() {
  return EEPROM.read(USERNAME_ADDR) != 0xFF;
}

void getUsername() {
  for (int i = 0; i < 15; i++) {
    username[i] = EEPROM.read(USERNAME_ADDR + i);
  }
  username[15] = '\0';
}

void saveUsername(char* input) {
  for (int i = 0; i < 15; i++) {
    EEPROM.write(USERNAME_ADDR + i, input[i]);
  }
  EEPROM.write(USERNAME_ADDR + 15, '\0');
  EEPROM.commit();
}

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

String getDateTimeString() {
  time_t now = time(nullptr);
  struct tm* timeinfo = localtime(&now);
  char buffer[25];
  strftime(buffer, sizeof(buffer), "%Y/%m/%d %H:%M:%S", timeinfo);
  return String(buffer);
}
