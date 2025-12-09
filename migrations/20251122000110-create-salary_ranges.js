'use strict';
module.exports = {
  async up(q,S){
    let c; try{ c=await q.describeTable('salary_ranges'); }catch{}
    if(!c){
      await q.createTable('salary_ranges',{
        id:{ type:S.INTEGER, primaryKey:true, autoIncrement:true },
        salary_from:{ type:S.DECIMAL(12,2), allowNull:false },
        salary_to:{ type:S.DECIMAL(12,2), allowNull:false },
        is_active:{ type:S.BOOLEAN, defaultValue:true },
        created_at:{ type:S.DATE, allowNull:false, defaultValue:S.literal('CURRENT_TIMESTAMP') },
        updated_at:{ type:S.DATE, allowNull:false, defaultValue:S.literal('CURRENT_TIMESTAMP') },
        deleted_at:{ type:S.DATE }
      });
    }
  },
  async down(q){ try{ await q.dropTable('salary_ranges'); }catch{} }
};
