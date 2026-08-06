'use strict';
module.exports = {
  async up(q,S){
    let c; try{ c=await q.describeTable('reports'); }catch{}
    if(!c){
      await q.createTable('reports',{
        id:{ type:S.INTEGER, primaryKey:true, autoIncrement:true },
        report_type:{ type:S.ENUM('employee','job'), allowNull:false },
        reason_id:{ type:S.INTEGER, allowNull:false },
        description:{ type:S.TEXT },
        read_at:{ type:S.DATE },
        created_at:{ type:S.DATE, allowNull:false, defaultValue:S.literal('CURRENT_TIMESTAMP') },
        updated_at:{ type:S.DATE, allowNull:false, defaultValue:S.literal('CURRENT_TIMESTAMP') },
        deleted_at:{ type:S.DATE }
      });
    }
  },
  async down(q){
    try{ await q.dropTable('reports'); }catch{}
    try{ await q.sequelize.query('DROP TYPE IF EXISTS enum_reports_report_type;'); }catch{}
  }
};
