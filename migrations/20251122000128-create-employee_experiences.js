'use strict';
module.exports = {
  async up(q,S){
    let c; try{ c=await q.describeTable('employee_experiences'); }catch{}
    if(!c){
      await q.createTable('employee_experiences',{
        id:{ type:S.INTEGER, primaryKey:true, autoIncrement:true },
        user_id:{
          type:S.INTEGER,
          allowNull:false,
          references:{ model:'employees', key:'id' },
          onDelete:'CASCADE'
        },
        document_type_id:{ type:S.INTEGER },
        work_nature_id:{ type:S.INTEGER },
        previous_firm:{ type:S.STRING },
        work_duration:{ type:S.DECIMAL(8,2) },
        work_duration_frequency:{ type:S.STRING },
        experience_certificate:{ type:S.STRING },
        created_at:{ type:S.DATE, allowNull:false, defaultValue:S.literal('CURRENT_TIMESTAMP') },
        updated_at:{ type:S.DATE, allowNull:false, defaultValue:S.literal('CURRENT_TIMESTAMP') },
        deleted_at:{ type:S.DATE }
      });
    }
  },
  async down(q){ try{ await q.dropTable('employee_experiences'); }catch{} }
};
