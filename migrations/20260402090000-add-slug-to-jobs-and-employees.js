'use strict';

const crypto = require('crypto');

const SLUG_ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

function generateSlug(length = 12) {
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += SLUG_ALPHABET[crypto.randomInt(0, SLUG_ALPHABET.length)];
  }
  return out;
}

async function backfillSlugs(queryInterface, tableName) {
  const [rows] = await queryInterface.sequelize.query(
      'SELECT id FROM `' + tableName + '` WHERE slug IS NULL OR slug = ""'
  );

  // Best-effort backfill; uniqueness enforced by DB index.
  for (const row of rows) {
    const id = row.id;
    if (!id) continue;

    for (let attempt = 0; attempt < 25; attempt += 1) {
      const slug = generateSlug();
      try {
        await queryInterface.sequelize.query(
            'UPDATE `' + tableName + '` SET slug = :slug WHERE id = :id AND (slug IS NULL OR slug = "")',
          { replacements: { slug, id } }
        );
        break;
      } catch (error) {
        // Retry on collisions (unique index) or transient issues.
        if (error && String(error.name || '').includes('SequelizeUniqueConstraintError')) {
          continue;
        }
        // MySQL unique constraint errors sometimes surface differently.
        const msg = String(error && (error.original?.message || error.message) || '');
        if (msg.toLowerCase().includes('duplicate') || msg.toLowerCase().includes('unique')) {
          continue;
        }
        throw error;
      }
    }
  }
}

module.exports = {
  async up(queryInterface, Sequelize) {
    // Employees
    await queryInterface.addColumn('employees', 'slug', {
      type: Sequelize.STRING(32),
      allowNull: true,
    });
    await queryInterface.addIndex('employees', ['slug'], {
      unique: true,
      name: 'employees_slug_unique',
    });

    // Jobs
    await queryInterface.addColumn('jobs', 'slug', {
      type: Sequelize.STRING(32),
      allowNull: true,
    });
    await queryInterface.addIndex('jobs', ['slug'], {
      unique: true,
      name: 'jobs_slug_unique',
    });

    // Backfill existing rows.
    await backfillSlugs(queryInterface, 'employees');
    await backfillSlugs(queryInterface, 'jobs');

    // Enforce NOT NULL after backfill.
    await queryInterface.changeColumn('employees', 'slug', {
      type: Sequelize.STRING(32),
      allowNull: false,
    });
    await queryInterface.changeColumn('jobs', 'slug', {
      type: Sequelize.STRING(32),
      allowNull: false,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('employees', 'employees_slug_unique');
    await queryInterface.removeColumn('employees', 'slug');

    await queryInterface.removeIndex('jobs', 'jobs_slug_unique');
    await queryInterface.removeColumn('jobs', 'slug');
  },
};
