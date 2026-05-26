# KontrolaTachometru API

An unofficial Node.js/Express API wrapper for [kontrolatachometru.cz](https://www.kontrolatachometru.cz/). This API allows you to programmatically fetch vehicle technical inspection (STK) records and mileage history using a Vehicle Identification Number (VIN). 

It automatically handles session tokens and bypasses the site's image CAPTCHA using the [Groq Vision API](https://groq.com/) for lightning-fast OCR.

## ✨ Features

- **Automated CAPTCHA Solving**: Uses Groq's high-speed Vision LLM (`llama-4-scout-17b-16e-instruct`) to seamlessly read and solve image CAPTCHAs.
- **Session Management**: Automatically extracts verification tokens and manages cookies for valid requests.
- **Robust Retries**: Built-in retry logic ensures successful data retrieval even if a CAPTCHA solve fails occasionally.
- **Structured Data**: Parses messy HTML tables into clean, structured JSON arrays.
- **TypeScript**: Fully typed for better developer experience and reliability.

## 🛠 Prerequisites

- **Node.js** (v18 or higher recommended)
- **npm** or **yarn**
- **Groq API Key**: You need an API key from [Groq Console](https://console.groq.com/keys) to power the CAPTCHA solver.

## 🚀 Installation & Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/chlibekp/kontrolatachometru-api.git
   cd kontrolatachometru-api
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure Environment Variables:**
   Copy the example environment file and add your Groq API key:
   ```bash
   cp example.env .env
   ```
   Open `.env` and add your key:
   ```env
   GROQ_API_KEY=gsk_your_api_key_here
   ```

4. **Run the development server:**
   ```bash
   npm run dev
   ```
   The server will start on `http://localhost:3000`.

## 📖 API Documentation

### Get Vehicle History

Fetches the inspection and mileage history for a specific vehicle.

- **URL:** `/api/carHistory`
- **Method:** `GET`
- **Query Parameters:**
  - `vin` (string, required): The Vehicle Identification Number (VIN) of the car.

#### Example Request

```bash
curl -X GET "http://localhost:3000/api/carHistory?vin=TMBA...YOUR_VIN...123"
```

#### Example Response (JSON)

```json
[
  {
    "rowId": "123456",
    "registrationCertificateNo": "AA123456",
    "vehicleCategoryName": "Osobní automobil",
    "vehicleTypeName": "M1",
    "vehicleMarkTypeName": "ŠKODA",
    "vehicleMarkName": "OCTAVIA",
    "registrationDate": "01.01.2015",
    "engineType": "Zážehový",
    "inspectionResultRateName": "Způsobilé",
    "beginDate": "15.05.2023",
    "defects": "",
    "date": "15.05.2023",
    "inspection": "Pravidelná",
    "protocolNumber": "CZ-1234567-23",
    "inspectionType": "STK",
    "mileage": "150 000",
    "note": ""
  }
]
```

## 🏗 Available Scripts

- `npm run dev`: Starts the server in development mode using `ts-node`.
- `npm run build`: Compiles the TypeScript source code to JavaScript in the `dist/` folder.
- `npm run start`: Runs the compiled JavaScript application.

## 💻 Tech Stack

- **[Express.js](https://expressjs.com/)**: Web framework for handling API routes.
- **[TypeScript](https://www.typescriptlang.org/)**: Static typing for safer code.
- **[Groq SDK](https://console.groq.com/docs/libraries)**: For blazing-fast Vision AI inference.
- **[Cheerio](https://cheerio.js.org/)**: For parsing and extracting data from HTML responses.

## ⚠️ Disclaimer

This is an **unofficial** tool. It is not affiliated with, endorsed by, or connected to the Ministry of Transport of the Czech Republic or `kontrolatachometru.cz`. This API wrapper relies on web scraping and automated CAPTCHA solving. Use it responsibly and at your own risk. Changes to the upstream website may break this API at any time.

## 📄 License

This project is licensed under the [WTFPL (Do What The Fuck You Want To Public License)](LICENSE).