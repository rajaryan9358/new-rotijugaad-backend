'use strict';
module.exports = {
  async up(q,S){
    let c; try{ c=await q.describeTable('payment_histories'); }catch{}
    if(!c){
      await q.createTable('payment_histories',{
        id:{ type:S.INTEGER, primaryKey:true, autoIncrement:true },
        user_type:{ type:S.STRING, allowNull:false },
        user_id:{ type:S.INTEGER, allowNull:false },
        plan_id:{ type:S.INTEGER },
        price_total:{ type:S.DECIMAL(12,2), allowNull:false },
        order_id:{ type:S.STRING },
        payment_id:{ type:S.STRING },
        payment_signature:{ type:S.STRING },
        status:{ type:S.STRING, allowNull:false, defaultValue:'pending' },
        contact_credit:{ type:S.INTEGER, defaultValue:0 },
        interest_credit:{ type:S.DECIMAL(12,2), defaultValue:0 },
        ads_credit:{ type:S.DECIMAL(12,2), defaultValue:0 },
        created_at:{ type:S.DATE, allowNull:false, defaultValue:S.literal('CURRENT_TIMESTAMP') },
        updated_at:{ type:S.DATE, allowNull:false, defaultValue:S.literal('CURRENT_TIMESTAMP') },
        deleted_at:{ type:S.DATE }
      });
    }
  },
  async down(q){ try{ await q.dropTable('payment_histories'); }catch{} }
};
