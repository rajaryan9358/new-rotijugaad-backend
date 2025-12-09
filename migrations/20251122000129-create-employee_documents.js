'use strict';
module.exports = {
  async up(q,S){
    let c; try{ c=await q.describeTable('employee_documents'); }catch{}
    if(!c){
      await q.createTable('employee_documents',{
        id:{ type:S.INTEGER, primaryKey:true, autoIncrement:true },
        user_id:{ type:S.INTEGER, allowNull:false },
        document_type:{ type:S.STRING(50), allowNull:false },
        document_name:{ type:S.STRING(255), allowNull:false },
        document_size:{ type:S.BIGINT, allowNull:false, defaultValue:0 },
        document_link:{ type:S.STRING(255), allowNull:false },
        created_at:{ type:S.DATE, allowNull:false, defaultValue:S.literal('CURRENT_TIMESTAMP') },
        updated_at:{ type:S.DATE, allowNull:false, defaultValue:S.literal('CURRENT_TIMESTAMP') },
        deleted_at:{ type:S.DATE }
      });
    }
  },
  async down(q){ try{ await q.dropTable('employee_documents'); }catch{} }
};
