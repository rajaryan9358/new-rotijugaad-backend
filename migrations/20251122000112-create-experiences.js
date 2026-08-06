'use strict';
module.exports = {
  async up(q,S){
    let c; try{ c=await q.describeTable('experiences'); }catch{}
    if(!c){
      await q.createTable('experiences',{
        id:{ type:S.INTEGER, primaryKey:true, autoIncrement:true },
        title_english:{ type:S.STRING, allowNull:false },
        title_hindi:{ type:S.STRING, allowNull:false },
        exp_from:{ type:S.INTEGER, allowNull:false },
        exp_to:{ type:S.INTEGER, allowNull:false },
        sequence:{ type:S.INTEGER },
        is_active:{ type:S.BOOLEAN, defaultValue:true },
        created_at:{ type:S.DATE, allowNull:false, defaultValue:S.literal('CURRENT_TIMESTAMP') },
        updated_at:{ type:S.DATE, allowNull:false, defaultValue:S.literal('CURRENT_TIMESTAMP') },
        deleted_at:{ type:S.DATE }
      });
    }
  },
  async down(q){ try{ await q.dropTable('experiences'); }catch{} }
};
