# DevOps Manifest Factory

DevOps Manifest Factory is a web application designed to generate Infrastructure as Code (IaC) manifests locally. Currently, it supports generating Kubernetes manifests.

## Project Structure

The project is divided into two main parts:

- **Backend**: A Node.js/Express server that handles the logic for generating manifests.
- **Frontend**: A React application that provides a user interface for inputting configuration and downloading generated files.

## Tech Stack

### Backend

- **Runtime**: Node.js
- **Framework**: Express.js
- **Dependencies**: `cors`, `nodemon` (dev)

### Frontend

- **Library**: React
- **Build Tool**: Create React App (react-scripts)
- **Styling**: CSS (Custom dark mode design)
- **HTTP Client**: Axios
- **Utilities**: `jszip`, `file-saver`, `react-syntax-highlighter`

## Prerequisites

- [Node.js](https://nodejs.org/) (v14 or higher recommended)
- npm (Node Package Manager)

## Installation & Setup

### 1. Backend Setup

Navigate to the `backend` directory and install dependencies:

```bash
cd backend
npm install
```

Start the backend server:

```bash
# For development (uses nodemon)
npm run dev

# For production
npm start
```

The backend server will start on `http://localhost:5000`.

### 2. Frontend Setup

Open a new terminal, navigate to the `frontend` directory, and install dependencies:

```bash
cd frontend
npm install
```

Start the frontend development server:

```bash
npm start
```

The frontend application will open in your browser at `http://localhost:3000`.

## Usage

1. Ensure both the backend and frontend servers are running.
2. Open the application in your browser (usually `http://localhost:3000`).
3. Use the interface to configure your Kubernetes resources (e.g., Deployments, Services).
4. Click "Generate" to preview the manifests.
5. Download the generated manifests as a ZIP file.

## API Endpoints

- **GET** `/api/health`: Checks if the backend is running.
- **POST** `/api/generate/:module`: Generates manifests for the specified module.
  - Supported modules: `kubernetes`
