#include <ESP8266WiFi.h>
#include <WiFiClientSecure.h>
#include <DHT.h>

#define DHTPIN D4     // Pin where the DHT11 is connected
#define DHTTYPE DHT11 // DHT 11

const char* ssid = "XXXX"; // Replace with your WiFi SSID
const char* password = "XXXX"; // Replace with your WiFi password
const char* getServerUrl = "https://bio-data-peach-kappa.vercel.app/api/v1/datas"; // Your GET URL
const char* postServerUrl = "/api/v1/datas/data"; // Your POST URL path
const char* host = "bio-data-peach-kappa.vercel.app"; // Hostname

DHT dht(DHTPIN, DHTTYPE);

void setup() {
  Serial.begin(115200);
  dht.begin();

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
  if (WiFi.status() == WL_CONNECTED) {
    WiFiClientSecure client;
    client.setInsecure(); // Disable certificate verification

    // Perform GET Request
    if (client.connect(host, 443)) {
      client.println("GET /api/v1/datas HTTP/1.1");
      client.println("Host: " + String(host));
      client.println("Connection: close");
      client.println(); // End of HTTP headers

      while (client.connected()) {
        String line = client.readStringUntil('\n');
        if (line == "\r") {
          break; // Headers received
        }
      }

      String response = client.readString(); // Get the response payload
      Serial.println("GET Response:");
      Serial.println(response); // Print the response
    } else {
      Serial.println("GET Connection failed");
    }

    client.stop(); // Close the connection

    // Perform POST Request
    float temperature = dht.readTemperature();
    float humidity = dht.readHumidity();

    if (client.connect(host, 443)) {
      String jsonPayload = "{\"temperature\":" + String(temperature) + ",\"humidity\":" + String(humidity) + "}";

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

  delay(500); // Repeat every 0.5 seconds
}
