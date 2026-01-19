const BusinessSettings = require("../models/BusinessSettings");

exports.getBusinessSettings = async (req, res) => {
  const settings =
    (await BusinessSettings.findOne()) ||
    (await BusinessSettings.create({}));
  res.json(settings);
};

exports.updateBusinessSettings = async (req, res) => {
  const settings =
    (await BusinessSettings.findOneAndUpdate({}, req.body, {
      new: true,
      upsert: true,
    }));
  res.json(settings);
};
