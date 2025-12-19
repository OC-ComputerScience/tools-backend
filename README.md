# Course Import Backend with Node

This application allows faculty members to manage course imports by assigning courses from previous terms to current courses.

#### Please note:
- You will need to create a database and be able to run it locally.
- This project utilizes **Google Authentication** to allow users to log in.
- You will need to provide a **Client ID from Google** for this project to run locally.

## Project Setup

1. Clone the project into your **XAMPP/xamppfiles/htdocs** directory.

```
git clone <repository-url>
```

2. Install the project.

```
npm install
```

3. Configure **Apache** to point to **Node** for API requests.
   - We recommend using XAMPP to serve this project.
   - In XAMPP, find the **Edit/Configure** button for **Apache**.
   - Edit the **conf** file, labeled **httpd.conf**.
   - Add the following line as the **last line**:
   
   ```
   ProxyPass /courseimport http://localhost:3200/courseimport
   ```
   
   - Find the following line and remove the **#** at the front:
   
   ```
   LoadModule proxy_http_module modules/mod_proxy_http.so
   LoadModule proxy_http2_module modules/mod_proxy_http2.so
   ```
   
   - Save the file.
   - **Restart Apache** and exit XAMPP.

4. Make a local **courseimport** database.
   - Create a schema/database.
   - The sequelize in this project will make all the tables for you.

5. Make sure you have a project registered with the **Google Developer console**.
   - https://console.developers.google.com/
   - Enable **Google+ API** and **Google Analytics API**.
   - Enable an **OAuth consent screen**.
   - Create an **OAuth client ID**.
   - Save your **Client ID** and **Client Secret** in a safe place.

6. Add a local **.env** file and make sure the **client ID** and **client secret** are the values you got from Google. Also make sure that the **database** variables are correct.
   - CLIENT_ID = '**your-google-client-id**'
   - CLIENT_SECRET = '**your-google-client-secret**'
   - DB_HOST = 'localhost'
   - DB_PW = '**your-local-database-password**'
   - DB_USER = '**your-local-database-username**' (usually "root")
   - DB_NAME = '**your-local-database-name**'

7. Compile and run the project locally.

```
npm run start
```

8. Test your project.
   - Note that to test your backend, you don't need anything to be running.

```
npm run test
```

## Logging

This project uses **Winston** for application logging and **Morgan** for HTTP request logging.

- Logs are written to `logs/error-%DATE%.log` (errors only) and `logs/all-%DATE%.log` (all levels)
- Console output is colored for better readability in development
- Log levels: error, warn, info, http, debug

## API Endpoints

### Authentication
- `POST /courseimport/login` - Login with Google
- `POST /courseimport/logout` - Logout

### Terms (Admin)
- `GET /courseimport/terms` - Get all terms
- `GET /courseimport/terms/:id` - Get term by ID
- `POST /courseimport/terms` - Create term
- `PUT /courseimport/terms/:id` - Update term
- `DELETE /courseimport/terms/:id` - Delete term

### Courses
- `GET /courseimport/courses` - Get all courses (with optional ?termId= and ?userId= filters)
- `GET /courseimport/courses/withCount` - Get courses with assignment count (Admin)
- `GET /courseimport/courses/user/:email` - Get courses for user by email
- `GET /courseimport/courses/:id` - Get course by ID
- `POST /courseimport/courses` - Create course
- `PUT /courseimport/courses/:id` - Update course
- `DELETE /courseimport/courses/:id` - Delete course

### Assigned Courses
- `GET /courseimport/assignedCourses` - Get all assigned courses (with optional ?courseId= filter)
- `GET /courseimport/assignedCourses/course/:courseId` - Get assigned course for a course
- `GET /courseimport/assignedCourses/:id` - Get assigned course by ID
- `POST /courseimport/assignedCourses` - Create assigned course
- `PUT /courseimport/assignedCourses/:id` - Update assigned course
- `DELETE /courseimport/assignedCourses/:id` - Delete assigned course
- `DELETE /courseimport/assignedCourses/course/:courseId` - Delete assigned course by courseId

### Users (Admin)
- `GET /courseimport/users` - Get all users
- `GET /courseimport/users/:id` - Get user by ID
- `PUT /courseimport/users/:id` - Update user

