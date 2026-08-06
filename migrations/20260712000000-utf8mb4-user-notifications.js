'use strict';

// Converts user_notifications to utf8mb4 so emoji in notification titles/bodies
// (e.g. ✅ 💙 🔥 🎉) can be stored without "Incorrect string value" errors.
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      'ALTER TABLE `user_notifications` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci'
    );
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      'ALTER TABLE `user_notifications` CONVERT TO CHARACTER SET utf8 COLLATE utf8_general_ci'
    );
  },
};
