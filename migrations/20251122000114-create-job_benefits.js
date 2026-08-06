'use strict';
module.exports = {
  async up(q,S){
    let c; try{ c=await q.describeTable('job_benefits'); }catch{}
    if(!c){
      await q.createTable('job_benefits',{
        id:{ type:S.INTEGER, primaryKey:true, autoIncrement:true },
        benefit_english:{ type:S.STRING, allowNull:false },
        benefit_hindi:{ type:S.STRING, allowNull:false },
        sequence:{ type:S.INTEGER },
        is_active:{ type:S.BOOLEAN, defaultValue:true },
        created_at:{ type:S.DATE, allowNull:false, defaultValue:S.literal('CURRENT_TIMESTAMP') },
        updated_at:{ type:S.DATE, allowNull:false, defaultValue:S.literal('CURRENT_TIMESTAMP') },
        deleted_at:{ type:S.DATE }
      });
    }
  },
  async down(q){ try{ await q.dropTable('job_benefits'); }catch{} }
};
