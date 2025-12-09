'use strict';
module.exports = {
  async up(q,S){
    let c; try{ c=await q.describeTable('call_histories'); }catch{}
    if(!c){
      await q.createTable('call_histories',{
        id:{ type:S.INTEGER, primaryKey:true, autoIncrement:true },
        user_type:{ type:S.STRING, allowNull:false },
        user_id:{ type:S.INTEGER, allowNull:false },
        call_experience_id:{ type:S.INTEGER },
        review:{ type:S.TEXT },
        read_at:{ type:S.DATE },
        created_at:{ type:S.DATE, allowNull:false, defaultValue:S.literal('CURRENT_TIMESTAMP') },
        updated_at:{ type:S.DATE, allowNull:false, defaultValue:S.literal('CURRENT_TIMESTAMP') },
        deleted_at:{ type:S.DATE }
      });
    }
  },
  async down(q){ try{ await q.dropTable('call_histories'); }catch{} }
};
