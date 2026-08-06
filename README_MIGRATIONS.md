# Database Migrations Guide

## Installation

First, install Sequelize CLI:
```bash
npm install --save-dev sequelize-cli
```

## Running Migrations

### Create Database (first time only)
```bash
npx sequelize-cli db:create
```

### Run All Pending Migrations
```bash
npx sequelize-cli db:migrate
```

### Undo Last Migration
```bash
npx sequelize-cli db:migrate:undo
```

### Undo All Migrations
```bash
npx sequelize-cli db:migrate:undo:all
```

## Creating New Migrations

```bash
npx sequelize-cli migration:generate --name create-table-name
```

Edit the generated file in `migrations/` folder with your schema.

Then run:
```bash
npx sequelize-cli db:migrate
```

## Environment Variables

Make sure your `.env` file contains:
```
DB_NAME=rotijugaad
DB_USER=root
DB_PASSWORD=your_password
DB_HOST=localhost
DB_PORT=3306
```

## Current Migrations

1. `001-create-users.js` - Creates users table with all fields

Create additional migrations for other models following the same pattern.
