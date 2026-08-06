'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('interviewer_contact_otps', 'session_id', {
      type: Sequelize.STRING,
      allowNull: true,
      after: 'otp',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('interviewer_contact_otps', 'session_id');
  },
};