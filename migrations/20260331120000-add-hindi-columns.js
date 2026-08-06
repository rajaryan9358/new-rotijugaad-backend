module.exports = {
  async up(queryInterface, Sequelize) {
    // call_histories
    await queryInterface.addColumn('call_histories', 'review_hindi', {
      type: Sequelize.TEXT,
      allowNull: true,
      after: 'review',
    });

    // employees
    await queryInterface.addColumn('employees', 'name_hindi', {
      type: Sequelize.STRING,
      allowNull: true,
      after: 'name',
    });
    await queryInterface.addColumn('employees', 'about_user_hindi', {
      type: Sequelize.TEXT,
      allowNull: true,
      after: 'about_user',
    });

    // employers
    await queryInterface.addColumn('employers', 'name_hindi', {
      type: Sequelize.STRING,
      allowNull: true,
      after: 'name',
    });
    await queryInterface.addColumn('employers', 'organization_name_hindi', {
      type: Sequelize.STRING,
      allowNull: true,
      after: 'organization_name',
    });
    await queryInterface.addColumn('employers', 'address_hindi', {
      type: Sequelize.TEXT,
      allowNull: true,
      after: 'address',
    });

    // notifications
    await queryInterface.addColumn('notifications', 'title_hindi', {
      type: Sequelize.STRING(255),
      allowNull: true,
      after: 'title',
    });
    await queryInterface.addColumn('notifications', 'body_hindi', {
      type: Sequelize.TEXT,
      allowNull: true,
      after: 'body',
    });
    await queryInterface.addColumn('notifications', 'target_hindi', {
      type: Sequelize.STRING(100),
      allowNull: true,
      after: 'target',
    });

    // reports
    await queryInterface.addColumn('reports', 'description_hindi', {
      type: Sequelize.TEXT,
      allowNull: true,
      after: 'description',
    });

    // volunteers
    await queryInterface.addColumn('volunteers', 'name_hindi', {
      type: Sequelize.STRING,
      allowNull: true,
      after: 'name',
    });
    await queryInterface.addColumn('volunteers', 'address_hindi', {
      type: Sequelize.TEXT,
      allowNull: true,
      after: 'address',
    });
    await queryInterface.addColumn('volunteers', 'description_hindi', {
      type: Sequelize.TEXT,
      allowNull: true,
      after: 'description',
    });
  },

  async down(queryInterface) {
    // call_histories
    await queryInterface.removeColumn('call_histories', 'review_hindi');

    // employees
    await queryInterface.removeColumn('employees', 'name_hindi');
    await queryInterface.removeColumn('employees', 'about_user_hindi');

    // employers
    await queryInterface.removeColumn('employers', 'name_hindi');
    await queryInterface.removeColumn('employers', 'organization_name_hindi');
    await queryInterface.removeColumn('employers', 'address_hindi');

    // notifications
    await queryInterface.removeColumn('notifications', 'title_hindi');
    await queryInterface.removeColumn('notifications', 'body_hindi');
    await queryInterface.removeColumn('notifications', 'target_hindi');

    // reports
    await queryInterface.removeColumn('reports', 'description_hindi');

    // volunteers
    await queryInterface.removeColumn('volunteers', 'name_hindi');
    await queryInterface.removeColumn('volunteers', 'address_hindi');
    await queryInterface.removeColumn('volunteers', 'description_hindi');
  },
};
