'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('users', 'mobile_change_pending', {
      type: Sequelize.STRING,
      allowNull: true,
      defaultValue: null,
    });

    await queryInterface.addColumn('users', 'mobile_change_otp_session_id', {
      type: Sequelize.STRING,
      allowNull: true,
      defaultValue: null,
    });

    await queryInterface.addColumn('users', 'mobile_change_otp_created_at', {
      type: Sequelize.DATE,
      allowNull: true,
      defaultValue: null,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('users', 'mobile_change_otp_created_at');
    await queryInterface.removeColumn('users', 'mobile_change_otp_session_id');
    await queryInterface.removeColumn('users', 'mobile_change_pending');
  },
};
