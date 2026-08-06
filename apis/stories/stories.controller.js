const { sendApiResponse } = require("../_helpers/response");

const Sequelize = require("sequelize");
const { Op } = Sequelize;

const Story = require('../../models/Story');
const User = require('../../models/User');
const Employee = require('../../models/Employee');
const Employer = require('../../models/Employer');
const EmployeeStory = require('../../models/EmployeeStory');
const EmployerStory = require('../../models/EmployerStory');

const {
  fetchWelcomeCreditSettings,
  buildEmployeeWelcomeCredits,
  buildEmployerWelcomeCredits,
} = require('../../utils/welcomeCredits');

const SUCCESS_CODE = "SC_01";

function toInt(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

async function resolveEmployeeFromParam(param, { createIfMissing = false } = {}) {
  const id = toInt(param);
  if (!id) return { employee: null, userId: null };

  // Backward compatibility: accept employeeId too.
  let employee = await Employee.findByPk(id);
  if (employee) return { employee, userId: employee.user_id };

  if (!createIfMissing) return { employee: null, userId: null };

  const user = await User.findByPk(id, { attributes: ["id"] });
  if (!user) return { employee: null, userId: null };

  try {
    const welcomeSetting = await fetchWelcomeCreditSettings();
    const welcomeCredits = buildEmployeeWelcomeCredits(welcomeSetting);
    employee = await Employee.create({ user_id: id, ...welcomeCredits });
    return { employee, userId: id };
  } catch (e) {
    employee = await Employee.findOne({ where: { user_id: id } });
    if (employee) return { employee, userId: id };
    throw e;
  }
}

async function resolveEmployerFromParam(param, { createIfMissing = false } = {}) {
  const id = toInt(param);
  if (!id) return { employer: null, userId: null };

  // Mobile app calls this endpoint with userId.
  // Prefer user_id matching to avoid collisions with Employer PKs.
  let employer = await Employer.findOne({ where: { user_id: id } });
  if (employer) return { employer, userId: id };

  // Backward compatibility: accept employerId too.
  employer = await Employer.findByPk(id);
  if (employer) return { employer, userId: employer.user_id };

  if (!createIfMissing) return { employer: null, userId: null };

  const user = await User.findByPk(id, { attributes: ["id", "name"] });
  if (!user) return { employer: null, userId: null };

  try {
    const fallbackName = String(user?.name || "").trim() || "Employer";
    const welcomeSetting = await fetchWelcomeCreditSettings();
    const welcomeCredits = buildEmployerWelcomeCredits(welcomeSetting);
    employer = await Employer.create({ user_id: id, name: fallbackName, ...welcomeCredits });
    return { employer, userId: id };
  } catch (e) {
    employer = await Employer.findOne({ where: { user_id: id } });
    if (employer) return { employer, userId: id };
    throw e;
  }
}


async function getEmployeeStories(req, res) {
  try {
    const requestedEmployeeId = toInt(req.params?.employeeId);
    if (!requestedEmployeeId) {
      return sendApiResponse(res, { ok: false, code: "FC_01", message: "Valid employee id is required", data: null });
    }

    if (!Story || !EmployeeStory) {
      return sendApiResponse(res, { ok: false, code: "FC_03", message: "Stories module unavailable", data: null });
    }

    const now = new Date();
    const stories = await Story.findAll({
      where: {
        user_type: "employee",
        is_active: true,
        [Op.or]: [{ expiry_at: null }, { expiry_at: { [Op.gt]: now } }],
      },
    });

    const { employee } = await resolveEmployeeFromParam(requestedEmployeeId);
    const employeeId = employee?.id || null;

    const reads = employeeId
      ? await EmployeeStory.findAll({
        where: { employee_id: employeeId },
        attributes: ["story_id", "read_at"],
      })
      : [];

    const readMap = new Map();
    for (const r of reads) {
      readMap.set(Number(r.story_id), r.read_at || null);
    }

    const data = stories.map((s) => {
      const plain = s.toJSON ? s.toJSON() : s;
      const readAt = readMap.get(Number(plain.id)) || null;
      return {
        ...plain,
        is_read: Boolean(readAt),
        read_at: readAt,
      };
    });

    return sendApiResponse(res, { ok: true, code: SUCCESS_CODE, message: "Stories fetched successfully", data });
  } catch (error) {
    console.error("[app][stories] getEmployeeStories error:", error);
    return sendApiResponse(res, { ok: false, code: "FC_03", message: "Failed to fetch stories", data: null });
  }
}

async function getEmployerStories(req, res) {
  try {
    const requestedEmployerId = toInt(req.params?.employerId);
    if (!requestedEmployerId) {
      return sendApiResponse(res, { ok: false, code: "FC_01", message: "Valid employer id is required", data: null });
    }

    if (!Story || !EmployerStory) {
      return sendApiResponse(res, { ok: false, code: "FC_03", message: "Stories module unavailable", data: null });
    }

    const now = new Date();
    const stories = await Story.findAll({
      where: {
        user_type: "employer",
        is_active: true,
        [Op.or]: [{ expiry_at: null }, { expiry_at: { [Op.gt]: now } }],
      },
    });

    const { employer } = await resolveEmployerFromParam(requestedEmployerId);
    const employerId = employer?.id || null;

    const reads = employerId
      ? await EmployerStory.findAll({
        where: { employer_id: employerId },
        attributes: ["story_id", "read_at"],
      })
      : [];

    const readMap = new Map();
    for (const r of reads) {
      readMap.set(Number(r.story_id), r.read_at || null);
    }

    const data = stories.map((s) => {
      const plain = s.toJSON ? s.toJSON() : s;
      const readAt = readMap.get(Number(plain.id)) || null;
      return {
        ...plain,
        is_read: Boolean(readAt),
        read_at: readAt,
      };
    });

    return sendApiResponse(res, { ok: true, code: SUCCESS_CODE, message: "Stories fetched successfully", data });
  } catch (error) {
    console.error("[app][stories] getEmployerStories error:", error);
    return sendApiResponse(res, { ok: false, code: "FC_03", message: "Failed to fetch stories", data: null });
  }
}

async function markEmployeeStoryRead(req, res) {
  try {
    const requestedEmployeeId = toInt(req.body?.employee_id ?? req.body?.employeeId);
    const storyId = toInt(req.body?.story_id ?? req.body?.storyId);

    if (!requestedEmployeeId) {
      return sendApiResponse(res, { ok: false, code: "FC_01", message: "Valid employee id is required", data: null });
    }
    if (!storyId) {
      return sendApiResponse(res, { ok: false, code: "FC_02", message: "Valid story id is required", data: null });
    }

    const story = await Story.findByPk(storyId);
    if (!story || story.user_type !== "employee") {
      return sendApiResponse(res, { ok: false, code: "FC_03", message: "Story not found", data: null });
    }

    const { employee } = await resolveEmployeeFromParam(requestedEmployeeId, { createIfMissing: true });
    if (!employee) {
      return sendApiResponse(res, { ok: false, code: "FC_01", message: "Employee not found", data: null });
    }

    const employeeId = employee.id;

    const now = new Date();
    const [row, created] = await EmployeeStory.findOrCreate({
      where: { employee_id: employeeId, story_id: storyId },
      defaults: { read_at: now },
    });

    if (!created) {
      await row.update({ read_at: now });
    }

    return sendApiResponse(res, {
      ok: true,
      code: SUCCESS_CODE,
      message: "Story marked read",
      data: { employee_id: employeeId, story_id: storyId, read_at: row.read_at || now },
    });
  } catch (error) {
    console.error("[app][stories] markEmployeeStoryRead error:", error);
    return sendApiResponse(res, { ok: false, code: "FC_04", message: "Failed to mark story read", data: null });
  }
}

async function markEmployerStoryRead(req, res) {
  try {
    const requestedEmployerId = toInt(req.body?.employer_id ?? req.body?.employerId);
    const storyId = toInt(req.body?.story_id ?? req.body?.storyId);

    if (!requestedEmployerId) {
      return sendApiResponse(res, { ok: false, code: "FC_01", message: "Valid employer id is required", data: null });
    }
    if (!storyId) {
      return sendApiResponse(res, { ok: false, code: "FC_02", message: "Valid story id is required", data: null });
    }

    const story = await Story.findByPk(storyId);
    if (!story || story.user_type !== "employer") {
      return sendApiResponse(res, { ok: false, code: "FC_03", message: "Story not found", data: null });
    }

    const { employer } = await resolveEmployerFromParam(requestedEmployerId, { createIfMissing: true });
    if (!employer) {
      return sendApiResponse(res, { ok: false, code: "FC_01", message: "Employer not found", data: null });
    }

    const employerId = employer.id;

    const now = new Date();
    const [row, created] = await EmployerStory.findOrCreate({
      where: { employer_id: employerId, story_id: storyId },
      defaults: { read_at: now },
    });

    if (!created) {
      await row.update({ read_at: now });
    }

    return sendApiResponse(res, {
      ok: true,
      code: SUCCESS_CODE,
      message: "Story marked read",
      data: { employer_id: employerId, story_id: storyId, read_at: row.read_at || now },
    });
  } catch (error) {
    console.error("[app][stories] markEmployerStoryRead error:", error);
    return sendApiResponse(res, { ok: false, code: "FC_04", message: "Failed to mark story read", data: null });
  }
}

module.exports = {
  getEmployeeStories,
  getEmployerStories,
  markEmployeeStoryRead,
  markEmployerStoryRead,
};
