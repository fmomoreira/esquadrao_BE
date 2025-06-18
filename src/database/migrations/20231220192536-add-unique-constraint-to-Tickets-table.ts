import { QueryInterface } from "sequelize";

module.exports = {
  up: (queryInterface: QueryInterface) => {
    return queryInterface.removeConstraint("Tickets", "contactid_companyid_unique"),
    queryInterface.addConstraint("Tickets", {
      type: "unique",
      name: "contactid_companyid_unique",
      fields:  ["contactId", "companyId", "whatsappId"],
    });
  },

  down: (queryInterface: QueryInterface) => {
    return queryInterface.removeConstraint(
      "Tickets",
      "contactid_companyid_unique"
    );
  }
};
