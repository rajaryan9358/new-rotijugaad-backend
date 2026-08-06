'use strict';
module.exports = {
  async up(q,S){
    let c; try{ c=await q.describeTable('users'); }catch{}
    if(!c){
      await q.createTable('users',{
        id:{ type:S.INTEGER, primaryKey:true, autoIncrement:true },
        name:{ type:S.STRING },
        mobile:{ type:S.STRING, allowNull:false, unique:true },
        otp:{ type:S.STRING },
        referred_by:{ type:S.STRING },
        preferred_language:{ type:S.STRING },
        phone_verified_at:{ type:S.DATE },
        is_active:{ type:S.BOOLEAN, defaultValue:true },
        verification_status:{ type:S.STRING, defaultValue:'pending' },
        verified_at:{ type:S.DATE },
        user_type:{ type:S.STRING },
        profile_status:{ type:S.STRING },
        kyc_status:{ type:S.STRING },
        referral_code:{ type:S.STRING, unique:true },
        total_referred:{ type:S.INTEGER, allowNull:false, defaultValue:0 },
        created_at:{ type:S.DATE, allowNull:false, defaultValue:S.literal('CURRENT_TIMESTAMP') },
        updated_at:{ type:S.DATE, allowNull:false, defaultValue:S.literal('CURRENT_TIMESTAMP') },
        deleted_at:{ type:S.DATE }
      });
    }
  },
  async down(q){ try{ await q.dropTable('users'); }catch{} }
};
