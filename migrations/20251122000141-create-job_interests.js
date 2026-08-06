'use strict';
module.exports = {
  async up(q,S){
    let c; try{ c=await q.describeTable('job_interests'); }catch{}
    if(!c){
      await q.createTable('job_interests',{
        id:{ type:S.INTEGER, primaryKey:true, autoIncrement:true },
        sender_id:{ type:S.INTEGER, allowNull:false },
        receiver_id:{ type:S.INTEGER, allowNull:false },
        job_id:{ type:S.INTEGER, allowNull:false },
        status:{ type:S.STRING, allowNull:false, defaultValue:'pending' },
        otp:{ type:S.STRING },
        created_at:{ type:S.DATE, allowNull:false, defaultValue:S.literal('CURRENT_TIMESTAMP') },
        updated_at:{ type:S.DATE, allowNull:false, defaultValue:S.literal('CURRENT_TIMESTAMP') },
        deleted_at:{ type:S.DATE }
      });
    }
  },
  async down(q){ try{ await q.dropTable('job_interests'); }catch{} }
};
