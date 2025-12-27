'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      const [roles] = await queryInterface.sequelize.query(
        `SELECT id FROM roles WHERE slug = 'super_admin' LIMIT 1`,
        { transaction }
      );

      let superRoleId = roles?.[0]?.id;
      if (!superRoleId) {
        const [result] = await queryInterface.bulkInsert('roles', [{
          name: 'Super Admin',
          slug: 'super_admin',
          permissions: JSON.stringify(['*']),
          created_at: new Date(),
          updated_at: new Date()
        }], { transaction, returning: true });

        superRoleId = result?.id;
        if (!superRoleId) {
          const [[created]] = await queryInterface.sequelize.query(
            `SELECT id FROM roles WHERE slug = 'super_admin' LIMIT 1`,
            { transaction }
          );
          superRoleId = created.id;
        }
      }

      const [admins] = await queryInterface.sequelize.query(
        `SELECT id FROM admins WHERE email = 'superadmin@rotijugaad.com' LIMIT 1`,
        { transaction }
      );
      if (!admins.length) {
        await queryInterface.bulkInsert('admins', [{
          name: 'Super Admin',
          email: 'superadmin@rotijugaad.com',
          password: 'SuperAdmin@123',
          role: 'admin',
          role_id: superRoleId,
          is_active: true,
          created_at: new Date(),
          updated_at: new Date()
        }], { transaction });
      }

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('admins', { email: 'superadmin@rotijugaad.com' });
  }
};
