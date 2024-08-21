#include <ESP8266WiFi.h>
#include <WiFiClientSecure.h>
#include <DHT.h>
#include <OneWire.h>
#include <DallasTemperature.h>

#define DHTPIN D4     // Pin where the DHT11 is connected
#define DHTTYPE DHT11 // DHT 11

// Data wire for DS18B20 is plugged into pin D3 on ESP8266
#define ONE_WIRE_BUS D3

const char* ssid = "XXXX"; // Replace with your WiFi SSID
const char* password = "XXXX"; // Replace with your WiFi password
const char* postServerUrl = "/api/v1/datas/data"; // Your POST URL path
const char* host = "bio-data-peach-kappa.vercel.app"; // Hostname

DHT dht(DHTPIN, DHTTYPE);
OneWire oneWire(ONE_WIRE_BUS);
DallasTemperature sensors(&oneWire);

void setup() {
  Serial.begin(115200);
  dht.begin();
  sensors.begin();

  WiFi.begin(ssid, password);
  Serial.print("Connecting to WiFi");

  // Wait for connection
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println();
  Serial.println("Connected to WiFi");
}

void loop() {
  sensors.requestTemperatures(); // Send the command to get temperatures
  float dsTemperature = sensors.getTempCByIndex(0); // Read temperature from DS18B20

  // Declare these variables outside the if block so they are accessible throughout the loop
  float temperature = dht.readTemperature();
  float humidity = dht.readHumidity();

  if (WiFi.status() == WL_CONNECTED) {
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

