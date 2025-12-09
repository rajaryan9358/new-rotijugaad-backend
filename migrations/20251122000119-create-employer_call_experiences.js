'use strict';
module.exports = {
  async up(q,S){
    let c; try{ c=await q.describeTable('employer_call_experiences'); }catch{}
    if(!c){
      await q.createTable('employer_call_experiences',{
        id:{ type:S.INTEGER, primaryKey:true, autoIncrement:true },
        experience_english:{ type:S.STRING, allowNull:false },
        experience_hindi:{ type:S.STRING, allowNull:false },
        sequence:{ type:S.INTEGER },
        is_active:{ type:S.BOOLEAN, defaultValue:true },
        created_at:{ type:S.DATE, allowNull:false, defaultValue:S.literal('CURRENT_TIMESTAMP') },
        updated_at:{ type:S.DATE, allowNull:false, defaultValue:S.literal('CURRENT_TIMESTAMP') },
        deleted_at:{ type:S.DATE }
      });
    }
  },
  async down(q){ try{ await q.dropTable('employer_call_experiences'); }catch{} }
};
