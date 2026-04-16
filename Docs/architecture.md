# System Architecture - TAM Platform

This document outlines the architectural decisions and high-level structure of the Transporters Association of Malawi (TAM) web platform.

## 1. Tech Stack

- **Frontend:** React (Vite), Tailwind CSS, Daisy UI
- **Backend:** Node.js, Express.js
- **Database:** MongoDB
- **Authentication:** JWT (JSON Web Tokens) with HTTP-only Cookies
- **File Storage:** Cloudinary (for vehicle bluebooks, licenses, and national IDs)

## 2. High-Level Design

The system follows a **Client-Server Architecture** with a layered backend approach to ensure separation of concerns.

### Backend Layers:

- **Controllers:** Handle incoming HTTP requests and format outgoing responses.
- **Services:** Contain the core business logic (e.g., member approval workflows, training program scheduling).
- **Repositories:** Responsible for direct database interactions using Mongoose.
- **Middleware:** Manages Authentication, Role-Based Access Control (RBAC), and centralized error handling.

## 3. User Roles

1. **Public User:** Access to the Member Directory, About page, and Services.
2. **Member:** Authenticated access to update company profiles, fleet details, and contact info.
3. **Admin:** Full access to the Admin Dashboard to manage CMS content, approve pending members, and view messages.

## 4. External Integrations

The platform provides links and coordinates with several Malawian regulatory bodies:

- Road Traffic and Safety Services Directorate
- MERA (Malawi Energy Regulatory Authority)
- Ministry of Transport
