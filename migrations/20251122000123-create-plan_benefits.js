'use strict';
module.exports = {
  async up(q,S){
    let c; try{ c=await q.describeTable('plan_benefits'); }catch{}
    if(!c){
      await q.createTable('plan_benefits',{
        id:{ type:S.INTEGER, primaryKey:true, autoIncrement:true },
        subscription_type:{ type:S.ENUM('Employee','Employer'), allowNull:false },
        plan_id:{ type:S.INTEGER, allowNull:false },
        benefit_english:{ type:S.STRING, allowNull:false },
        benefit_hindi:{ type:S.STRING },
        sequence:{ type:S.INTEGER },
        is_active:{ type:S.BOOLEAN, defaultValue:true },
        created_at:{ type:S.DATE, allowNull:false, defaultValue:S.literal('CURRENT_TIMESTAMP') },
        updated_at:{ type:S.DATE, allowNull:false, defaultValue:S.literal('CURRENT_TIMESTAMP') },
        deleted_at:{ type:S.DATE }
      });
    }
  },
  async down(q){
    try { await q.dropTable('plan_benefits'); } catch {}
    try { await q.sequelize.query('DROP TYPE IF EXISTS enum_plan_benefits_subscription_type;'); } catch {}
  }
};
