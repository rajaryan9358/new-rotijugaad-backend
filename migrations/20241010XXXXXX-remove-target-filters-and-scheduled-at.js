'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.removeColumn('notifications', 'target_filters');
    await queryInterface.removeColumn('notifications', 'scheduled_at');
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.addColumn('notifications', 'target_filters', {
      type: Sequelize.JSON,
      allowNull: true,
      comment: 'Additional key/value filters to refine targeting rules',
    });
    await queryInterface.addColumn('notifications', 'scheduled_at', {
      type: Sequelize.DATE,
      allowNull: true,
    });
  },
};
