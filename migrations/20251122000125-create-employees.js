'use strict';
module.exports = {
  async up(q,S){
    let c; try{ c=await q.describeTable('employees'); }catch{}
    if(!c){
      await q.createTable('employees',{
        id:{ type:S.INTEGER, primaryKey:true, autoIncrement:true },
        user_id:{ type:S.INTEGER, allowNull:false },
        name:{ type:S.STRING },
        dob:{ type:S.DATEONLY },
        gender:{ type:S.STRING },
        state_id:{ type:S.INTEGER },
        city_id:{ type:S.INTEGER },
        preferred_state_id:{ type:S.INTEGER },
        preferred_city_id:{ type:S.INTEGER },
        qualification_id:{ type:S.INTEGER },
        expected_salary:{ type:S.DECIMAL(12,2) },
        expected_salary_frequency:{ type:S.STRING },
        preferred_shift_id:{ type:S.INTEGER },
        assistant_code:{ type:S.STRING },
        email:{ type:S.STRING },
        about_user:{ type:S.TEXT },
        aadhar_number:{ type:S.STRING },
        aadhar_verified_at:{ type:S.DATE },
        selfie_link:{ type:S.STRING(255) },
        verification_status:{ type:S.STRING, defaultValue:'pending' },
        kyc_status:{ type:S.STRING, defaultValue:'pending' },
        total_contact_credit:{ type:S.INTEGER, allowNull:false, defaultValue:0 },
        contact_credit:{ type:S.INTEGER, allowNull:false, defaultValue:0 },
        total_interest_credit:{ type:S.DECIMAL(12,2), allowNull:false, defaultValue:0 },
        interest_credit:{ type:S.DECIMAL(12,2), allowNull:false, defaultValue:0 },
        credit_expiry_at:{ type:S.DATE },
        subscription_plan_id:{ type:S.INTEGER },
        created_at:{ type:S.DATE, allowNull:false, defaultValue:S.literal('CURRENT_TIMESTAMP') },
        updated_at:{ type:S.DATE, allowNull:false, defaultValue:S.literal('CURRENT_TIMESTAMP') },
        deleted_at:{ type:S.DATE }
      });
    }
  },
  async down(q){ try{ await q.dropTable('employees'); }catch{} }
};
