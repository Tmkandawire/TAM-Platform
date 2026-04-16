# Database Schema Documentation

The TAM platform utilizes a NoSQL document model via MongoDB. Below are the primary collections and their relationships.

## 1. Users Collection

Stores authentication data and user roles.

- `email` (String): Unique identifier for login.
- `password` (String): Hashed credential.
- `role` (String): `admin` or `member`.
- `status` (String): `pending`, `active`, or `suspended`.
- `profileId` (ObjectId): Reference to the Profiles collection.

## 2. Profiles Collection

Detailed information about Malawian transporters.

- `companyName` (String): Indexed for public directory searching.
- `contact` (Object):
  - `phone` (String): Support for Malawian formats (e.g., +265).
  - `email` (String): Public-facing business email.
- `address` (Object): Includes details for the Kanengo Industrial Area or other locations.
- `services` (Array): Categorized by Wet Cargo (Petroleum) and Dry Cargo.
- `fleet` (Array): Range of 3 to 30 tonnes, including tankers.
- `documents` (Array): URLs for Bluebooks, Driving Licenses, and National IDs.

## 3. CMS Collection

Used to manage dynamic website content.

- `type` (String): `project`, `news`, or `event`.
- `category` (String): Identifies "Current" or "Past" projects.
- `title` (String): e.g., "Haulage of Petroleum for NOCMA".
- `content` (String): Detailed project or news description.
- `partners` (Array): Associated clients like PIL, Salima Sugar, or DODMA.
- `media` (Array): URLs to hosted images or videos.

## 4. Inquiries Collection

Captures messages from the public contact form.

- `senderName` (String)
- `senderEmail` (String)
- `subject` (String)
- `message` (String)
- `createdAt` (Date): For administrative tracking and response.

## 5. Indexing Strategy

- **Text Index:** Applied to `companyName` and `services` for efficient directory searching.
- **Unique Index:** Applied to `email` in the Users collection.
- **Compound Index:** Applied to `status` and `role` for the Admin approval dashboard.
