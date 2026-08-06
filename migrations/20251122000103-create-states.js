'use strict';
module.exports = {
  async up(q,S){
    let c; try{ c=await q.describeTable('states'); }catch{}
    if(!c){
      await q.createTable('states',{
        id:{ type:S.INTEGER, primaryKey:true, autoIncrement:true },
        state_english:{ type:S.STRING, allowNull:false },
        state_hindi:{ type:S.STRING, allowNull:false },
        sequence:{ type:S.INTEGER },
        is_active:{ type:S.BOOLEAN, defaultValue:true },
        created_at:{ type:S.DATE, allowNull:false, defaultValue:S.literal('CURRENT_TIMESTAMP') }
      });
    }
  },
  async down(q){ try{ await q.dropTable('states'); }catch{} }
};
