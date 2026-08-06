'use strict';
module.exports = {
  async up(queryInterface, Sequelize) {
    let rolesSchema;
    try { rolesSchema = await queryInterface.describeTable('roles'); } catch {}
    if (!rolesSchema) {
      await queryInterface.createTable('roles', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        name: { type: Sequelize.STRING, allowNull: false },
        slug: { type: Sequelize.STRING, allowNull: false, unique: true },
        permissions: { type: Sequelize.JSON, allowNull: false, defaultValue: [] },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') }
      });
      const now = new Date();
      await queryInterface.bulkInsert('roles', [
        { name: 'Super Admin', slug: 'super_admin', permissions: JSON.stringify(['*']), created_at: now, updated_at: now },
        { name: 'Operations', slug: 'operations', permissions: JSON.stringify(['users.view','employees.view','employees.verify','employers.view','jobs.view']), created_at: now, updated_at: now }
      ]);
    }

    const admins = await queryInterface.describeTable('admins');
    if (!admins.role_id) {
      await queryInterface.addColumn('admins', 'role_id', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'roles', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
        after: 'role'
      });
      await queryInterface.sequelize.query(`
        UPDATE admins
        SET role_id = (SELECT id FROM roles WHERE slug = 'super_admin' LIMIT 1)
        WHERE role_id IS NULL
      `);
    }
  },
  async down(queryInterface) {
    try { await queryInterface.removeColumn('admins', 'role_id'); } catch {}
    try { await queryInterface.dropTable('roles'); } catch {}
  }
};
