'use strict';
module.exports = {
  async up(q,S){
    let c; try{ c=await q.describeTable('employee_subscription_plans'); }catch{}
    if(!c){
      await q.createTable('employee_subscription_plans',{
        id:{ type:S.INTEGER, primaryKey:true, autoIncrement:true },
        plan_name_english:{ type:S.STRING, allowNull:false },
        plan_name_hindi:{ type:S.STRING },
        plan_validity_days:{ type:S.INTEGER, allowNull:false, defaultValue:0 },
        plan_tagline_english:{ type:S.STRING },
        plan_tagline_hindi:{ type:S.STRING },
        plan_price:{ type:S.DECIMAL(12,2), allowNull:false, defaultValue:0 },
        contact_credits:{ type:S.INTEGER, allowNull:false, defaultValue:0 },
        interest_credits:{ type:S.DECIMAL(12,2), allowNull:false, defaultValue:0 },
        sequence:{ type:S.INTEGER },
        is_active:{ type:S.BOOLEAN, defaultValue:true },
        created_at:{ type:S.DATE, allowNull:false, defaultValue:S.literal('CURRENT_TIMESTAMP') },
        updated_at:{ type:S.DATE, allowNull:false, defaultValue:S.literal('CURRENT_TIMESTAMP') },
        deleted_at:{ type:S.DATE }
      });
    }
  },
  async down(q){ try{ await q.dropTable('employee_subscription_plans'); }catch{} }
};
