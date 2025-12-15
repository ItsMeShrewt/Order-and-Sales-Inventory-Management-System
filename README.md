To run the application...

BACKEND
1. Go to the Backend Folder and use this command:
cd OSTIMS_DB

2. Install Dependencies:
composer install

3. Set up environment and key:
cp .env.example .env && php artisan key:generate

4. Run database migration:
php artisan migrate

5. Start the Backend Server:
php artisan serve

FRONTEND
1. Open the frontend folder:
cd FE

2. Install Dependencies:
npm install

3. Start the Frontend Server:
npm run dev


