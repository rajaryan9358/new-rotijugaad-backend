'use strict';

module.exports = {
  up: async (queryInterface) => {
    // Speeds up: GET /api/notifications ORDER BY created_at DESC
    await queryInterface.addIndex('notifications', ['created_at'], {
      name: 'idx_notifications_created_at',
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeIndex('notifications', 'idx_notifications_created_at');
  },
};
