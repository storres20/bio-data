// Include necessary libraries
#include <ESP8266WiFi.h>
#include <WiFiClientSecure.h>
#include <DHT.h>
#include <OneWire.h>
#include <DallasTemperature.h>

// Define sensor pins
#define DHTPIN D4     // Pin where the DHT11 is connected
#define DHTTYPE DHT11 // DHT 11 model
#define ONE_WIRE_BUS D3 // Pin for DS18B20 sensor

// WiFi and server configuration
const char* ssid = "XXXX"; // WiFi SSID
const char* password = "XXXX"; // WiFi password
const char* postServerUrl = "/api/v1/datas/data"; // API endpoint for POST request
const char* host = "bio-data-peach-kappa.vercel.app"; // Server hostname

// Initialize sensors
DHT dht(DHTPIN, DHTTYPE);
OneWire oneWire(ONE_WIRE_BUS);
DallasTemperature sensors(&oneWire);

void setup() {
  Serial.begin(115200); // Start serial communication at 115200 baud
  dht.begin(); // Initialize DHT sensor
  sensors.begin(); // Initialize DS18B20 sensor

  WiFi.begin(ssid, password); // Connect to WiFi
  Serial.print("Connecting to WiFi");

  // Wait for WiFi connection
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nConnected to WiFi"); // Notify when connected
}

void loop() {
  sensors.requestTemperatures(); // Request temperature data from DS18B20
  float dsTemperature = sensors.getTempCByIndex(0); // Get temperature from DS18B20

  float temperature = dht.readTemperature(); // Read temperature from DHT11
  float humidity = dht.readHumidity(); // Read humidity from DHT11

  // Check WiFi connection before sending data
  if (WiFi.status() == WL_CONNECTED) {
    WiFiClientSecure client;
    client.setInsecure(); // Disable SSL/TLS certificate verification

    // Attempt to connect to the server
    if (client.connect(host, 443)) {
      // Create JSON payload with sensor data
      String jsonPayload = "{\"temperature\":" + String(temperature) + ", \"humidity\":" + String(humidity) + ", \"dsTemperature\":" + String(dsTemperature) + "}";

      // Send HTTP POST request with headers and payload
      client.println("POST " + String(postServerUrl) + " HTTP/1.1");
      client.println("Host: " + String(host));
      client.println("Content-Type: application/json");
      client.println("Content-Length: " + String(jsonPayload.length()));
      client.println("Connection: close");
      client.println(); // End of HTTP headers
      client.println(jsonPayload); // POST message body

      // Read server response until headers are complete
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
  }

  // Display temperature and humidity data on the Serial Monitor
  Serial.print("DHT Temperature: ");
  Serial.print(temperature);
  Serial.print("°C, Humidity: ");
  Serial.print(humidity);
  Serial.println("%");

  Serial.print("DS18B20 Temperature: ");
  Serial.print(dsTemperature);
  Serial.println("°C");

  delay(500); // Delay before repeating the loop
}
