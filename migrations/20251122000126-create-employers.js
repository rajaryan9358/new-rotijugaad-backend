'use strict';
module.exports = {
  async up(q,S){
    let c; try{ c=await q.describeTable('employers'); }catch{}
    if(!c){
      await q.createTable('employers',{
        id:{ type:S.INTEGER, primaryKey:true, autoIncrement:true },
        user_id:{ type:S.INTEGER, allowNull:false },
        name:{ type:S.STRING, allowNull:false },
        organization_type:{ type:S.STRING },
        organization_name:{ type:S.STRING },
        business_category_id:{ type:S.INTEGER },
        address:{ type:S.TEXT },
        state_id:{ type:S.INTEGER },
        city_id:{ type:S.INTEGER },
        assisted_by:{ type:S.STRING },
        email:{ type:S.STRING },
        aadhar_number:{ type:S.STRING },
        aadhar_verified_at:{ type:S.DATE },
        document_link:{ type:S.STRING },
        verification_status:{ type:S.STRING, defaultValue:'pending' },
        kyc_status:{ type:S.STRING, defaultValue:'pending' },
        total_contact_credit:{ type:S.INTEGER, allowNull:false, defaultValue:0 },
        contact_credit:{ type:S.INTEGER, allowNull:false, defaultValue:0 },
        total_interest_credit:{ type:S.DECIMAL(12,2), allowNull:false, defaultValue:0 },
        interest_credit:{ type:S.DECIMAL(12,2), allowNull:false, defaultValue:0 },
        total_ad_credit:{ type:S.INTEGER, allowNull:false, defaultValue:0 },
        ad_credit:{ type:S.INTEGER, allowNull:false, defaultValue:0 },
        credit_expiry_at:{ type:S.DATE },
        subscription_plan_id:{ type:S.INTEGER },
        is_active:{ type:S.BOOLEAN, defaultValue:true },
        created_at:{ type:S.DATE, allowNull:false, defaultValue:S.literal('CURRENT_TIMESTAMP') },
        updated_at:{ type:S.DATE, allowNull:false, defaultValue:S.literal('CURRENT_TIMESTAMP') },
        deleted_at:{ type:S.DATE }
      });
    }
  },
  async down(q){ try{ await q.dropTable('employers'); }catch{} }
};
