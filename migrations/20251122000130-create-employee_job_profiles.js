'use strict';
module.exports = {
  async up(q,S){
    let c; try{ c=await q.describeTable('employee_job_profiles'); }catch{}
    if(!c){
      await q.createTable('employee_job_profiles',{
        id:{ type:S.INTEGER, primaryKey:true, autoIncrement:true },
        employee_id:{ type:S.INTEGER, allowNull:false },
        job_profile_id:{ type:S.INTEGER, allowNull:false },
        created_at:{ type:S.DATE, allowNull:false, defaultValue:S.literal('CURRENT_TIMESTAMP') },
        updated_at:{ type:S.DATE, allowNull:false, defaultValue:S.literal('CURRENT_TIMESTAMP') },
        deleted_at:{ type:S.DATE }
      });
      await q.addIndex('employee_job_profiles',['employee_id','job_profile_id'],{ unique:true });
    }
  },
  async down(q){ try{ await q.dropTable('employee_job_profiles'); }catch{} }
};
