'use strict';
module.exports = {
  async up(q,S){
    let c; try{ c=await q.describeTable('employee_contacts'); }catch{}
    if(!c){
      await q.createTable('employee_contacts',{
        id:{ type:S.INTEGER, primaryKey:true, autoIncrement:true },
        employee_id:{ type:S.INTEGER, allowNull:false },
        job_id:{ type:S.INTEGER, allowNull:false },
        employer_id:{ type:S.INTEGER, allowNull:false },
        call_experience_id:{
          type:S.INTEGER,
          references:{ model:'call_histories', key:'id' },
          onDelete:'SET NULL'
        },
        closing_credit:{ type:S.DECIMAL(12,2) },
        created_at:{ type:S.DATE, allowNull:false, defaultValue:S.literal('CURRENT_TIMESTAMP') },
        updated_at:{ type:S.DATE, allowNull:false, defaultValue:S.literal('CURRENT_TIMESTAMP') },
        deleted_at:{ type:S.DATE }
      });
    }
  },
  async down(q){ try{ await q.dropTable('employee_contacts'); }catch{} }
};
