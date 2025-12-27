const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');
const Admin = require('./Admin');

const DeletedUser = sequelize.define(
  'DeletedUser',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    mobile: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    referred_by: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    deleted_by: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    user_type: {
      type: DataTypes.STRING,
      allowNull: true,
      validate: {
        isIn: {
          args: [['employee', 'employer']],
          msg: 'user_type must be either employee or employer',
        },
      },
    },
    deleted_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    last_seen: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    user_life: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    organization_type: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    organization_name: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    business_category: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    email: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  },
  {
    tableName: 'deleted_users',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  }
);

// deleted_users.deleted_by -> admins.id
// Used by DeletedUsers page to show admin name.
if (!DeletedUser.associations?.DeletedBy) {
  DeletedUser.belongsTo(Admin, {
    foreignKey: 'deleted_by',
    as: 'DeletedBy',
    constraints: false
  });
}

module.exports = DeletedUser;
