'use strict';
module.exports = {
  async up(q,S){
    let c; try{ c=await q.describeTable('selected_job_benefits'); }catch{}
    if(!c){
      await q.createTable('selected_job_benefits',{
        id:{ type:S.INTEGER, primaryKey:true, autoIncrement:true },
        job_id:{ type:S.INTEGER, allowNull:false },
        benefit_id:{ type:S.INTEGER, allowNull:false },
        created_at:{ type:S.DATE, allowNull:false, defaultValue:S.literal('CURRENT_TIMESTAMP') }
      });
    }
  },
  async down(q){ try{ await q.dropTable('selected_job_benefits'); }catch{} }
};
