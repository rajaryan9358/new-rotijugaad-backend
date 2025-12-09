'use strict';
module.exports = {
  async up(q,S){
    let c; try{ c=await q.describeTable('jobs'); }catch{}
    if(!c){
      await q.createTable('jobs',{
        id:{ type:S.INTEGER, primaryKey:true, autoIncrement:true },
        employer_id:{ type:S.INTEGER, allowNull:false },
        job_profile_id:{ type:S.INTEGER },
        is_household:{ type:S.BOOLEAN, allowNull:false, defaultValue:false },
        description_english:{ type:S.TEXT },
        description_hindi:{ type:S.TEXT },
        no_vacancy:{ type:S.INTEGER, allowNull:false, defaultValue:1 },
        interviewer_contact:{ type:S.STRING },
        interviewer_contact_otp:{ type:S.STRING },
        job_address_english:{ type:S.TEXT },
        job_address_hindi:{ type:S.TEXT },
        job_state_id:{ type:S.INTEGER },
        job_city_id:{ type:S.INTEGER },
        other_benefit_english:{ type:S.TEXT },
        other_benefit_hindi:{ type:S.TEXT },
        salary_min:{ type:S.DECIMAL(12,2) },
        salary_max:{ type:S.DECIMAL(12,2) },
        work_start_time:{ type:S.TIME },
        work_end_time:{ type:S.TIME },
        status:{ type:S.STRING, allowNull:false, defaultValue:'active' },
        hired_total:{ type:S.INTEGER, allowNull:false, defaultValue:0 },
        expired_at:{ type:S.DATE },
        created_at:{ type:S.DATE, allowNull:false, defaultValue:S.literal('CURRENT_TIMESTAMP') },
        updated_at:{ type:S.DATE, allowNull:false, defaultValue:S.literal('CURRENT_TIMESTAMP') },
        deleted_at:{ type:S.DATE }
      });
    }
  },
  async down(q){ try{ await q.dropTable('jobs'); }catch{} }
};
