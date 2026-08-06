'use strict';
module.exports = {
  async up(q,S){
    let c; try{ c=await q.describeTable('stories'); }catch{}
    if(!c){
      await q.createTable('stories',{
        id:{ type:S.INTEGER, primaryKey:true, autoIncrement:true },
        user_type:{ type:S.STRING, allowNull:false },
        title_english:{ type:S.STRING, allowNull:false },
        title_hindi:{ type:S.STRING },
        description_english:{ type:S.TEXT, allowNull:false },
        description_hindi:{ type:S.TEXT },
        image:{ type:S.STRING(255) },
        expiry_at:{ type:S.DATE },
        sequence:{ type:S.INTEGER, allowNull:false, defaultValue:0 },
        is_active:{ type:S.BOOLEAN, allowNull:false, defaultValue:true },
        created_at:{ type:S.DATE, allowNull:false, defaultValue:S.literal('CURRENT_TIMESTAMP') },
        updated_at:{ type:S.DATE, allowNull:false, defaultValue:S.literal('CURRENT_TIMESTAMP') },
        deleted_at:{ type:S.DATE }
      });
    }
  },
  async down(q){ try{ await q.dropTable('stories'); }catch{} }
};
