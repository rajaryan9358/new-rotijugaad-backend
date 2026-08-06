'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const now = new Date();
    const permissions = JSON.stringify(['*']);

    const existing = await queryInterface.sequelize.query(
      "SELECT id FROM roles WHERE slug = 'super_admin' LIMIT 1",
      { type: Sequelize.QueryTypes.SELECT },
    );

    if (existing.length) {
      await queryInterface.bulkUpdate(
        'roles',
        {
          name: 'Super Admin',
          permissions,
          updated_at: now,
        },
        { slug: 'super_admin' },
      );
      return;
    }

    await queryInterface.bulkInsert('roles', [{
      name: 'Super Admin',
      slug: 'super_admin',
      permissions,
      created_at: now,
      updated_at: now,
    }]);
  },

  async down() {
    // no-op: this migration only ensures the role exists with full access
  },
};
