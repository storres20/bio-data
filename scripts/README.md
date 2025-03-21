Question:
i'm using a correct username and password but i still receiving 400 bad request

ChatGPT dijo:
Issue: Login Fails with 400 Bad Request
Your login is failing because your passwords are stored in plain text, but your backend expects hashed passwords using bcrypt. Since bcrypt hashes passwords before comparing them, and your database contains plain text passwords, the comparison will always fail.

🔍 How to Fix the Issue
✅ Solution 1: Update Passwords in the Database (Hashing)
Since your passwords are stored in plain text ("123456"), you must update them to hashed passwords.

1️⃣ Convert Plain Text Passwords to Hashed Passwords
Run this Node.js script one time to hash and update the passwords in MongoDB:

📂 Create a new script: scripts/hashPasswords.js

2️⃣ Run the Script
In the terminal, run:

Run in the terminal:
node scripts/hashPasswords.js

✅ Now all passwords in MongoDB will be hashed, and login will work correctly.